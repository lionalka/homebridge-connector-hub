/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
/* eslint-disable indent */
import {DgramAsPromised} from 'dgram-as-promised';
import {PlatformConfig} from 'homebridge';

import {Log} from '../util/log';

import {DeviceCmd, DeviceInfo, DeviceOpCode, GetDeviceListAck, GetDeviceListReq, ReadDeviceAck, ReadDeviceReq, WriteDeviceAck, WriteDeviceReq} from './connector-hub-api';
import {kNetworkSettings, kSendPort, ReadDeviceType} from './connector-hub-constants';
import {computeAccessToken, makeGetDeviceListRequest, makeReadDeviceRequest, makeWriteDeviceRequest, tryParse} from './connector-hub-helpers';

// Types we expect for connector hub requests and responses.
type DeviceRequest = GetDeviceListReq|WriteDeviceReq|ReadDeviceReq;
type DeviceResponse = GetDeviceListAck|WriteDeviceAck|ReadDeviceAck;

// Stagger outgoing UDP sends across all accessories so we don't overwhelm
// the physical hub when many devices are commanded at once (e.g. during a
// scene). Implemented as a serialized promise chain that enforces a minimum
// delay between commands, configurable via commandSpacingMs.
//
// On top of that, enforce a separate, typically longer minimum delay between
// two commands sent to the *same physical device* (same mac), configurable
// via sameDeviceSpacingMs. This matters for TDBU blinds, which expose two
// Homekit accessories (Top-Down and Bottom-Up) that share one physical
// motor controller. A scene commonly targets both halves within the same
// burst; if the second command arrives too soon after the first — even when
// the first is a same-position no-op — some motor controllers appear to
// silently ignore it, acking the UDP request without actually moving.
// Sending direct single commands to one half never hits this, which is what
// first pointed at per-device timing rather than a general network issue.
//
// IMPORTANT: The chain resolves AFTER the full ACK round-trip (not just after
// the UDP packet is sent). This ensures that when sameDeviceSpacingMs starts
// counting, the hub has already finished processing and responding to the
// previous command for that mac — giving the motor controller's RF layer time
// to fully clear before the next command arrives.

// Timestamps of the last completed (acked) command — global and per-device.
let lastAckTime = 0;
const lastDeviceAckTime = new Map<string, number>();

// The serialized send chain. Each command appends to it and the chain does
// not advance until the current command has received its hub response (or
// timed out), enforcing strict sequencing across all concurrent callers.
let sendChain: Promise<void> = Promise.resolve();

// Acquire a slot in the send queue. Returns a Promise that resolves with a
// `release` function once it's this command's turn to send (after any required
// spacing delay). The caller MUST call `release()` after the full ack cycle
// completes (success or error) — the next queued command is blocked on it.
function acquireSendSlot(mac?: string): Promise<() => void> {
  // `done` is resolved by the caller after the ack arrives. The chain blocks
  // on it so the next command cannot start its spacing timer until ack receipt.
  let release!: () => void;
  const done = new Promise<void>(res => { release = res; });

  // `myTurn` resolves when this command's required spacing delay has elapsed
  // and it is safe to send. This is also when we record the send timestamp
  // that the NEXT command's spacing will be computed relative to.
  const myTurn = sendChain.then(() => new Promise<void>((go) => {
    const now = Date.now();
    const spacingMs = kNetworkSettings.commandSpacingMs || 0;
    let wait = Math.max(0, spacingMs - (now - lastAckTime));
    if (mac) {
      const deviceSpacingMs = kNetworkSettings.sameDeviceSpacingMs || 0;
      wait = Math.max(wait, deviceSpacingMs - (now - (lastDeviceAckTime.get(mac) ?? 0)));
    }
    setTimeout(go, wait);
  }));

  // Block the chain behind BOTH: our spacing delay AND the caller's release().
  sendChain = myTurn.then(() => done);

  // Give the caller a wrapped release that stamps the ack time before
  // unblocking the chain, so the next command's spacing is measured from
  // our ack receipt rather than from our send time.
  return myTurn.then(() => () => {
    lastAckTime = Date.now();
    if (mac) {
      lastDeviceAckTime.set(mac, Date.now());
    }
    release();
  });
}

// Function to send a request to the hub and receive a sequence of responses.
async function sendCommandMultiResponse(
    cmdObj: DeviceRequest, ip: string,
    expectSingleResponse = false): Promise<DeviceResponse[]> {
  // Array of responses received from the hub(s).
  const responses: DeviceResponse[] = [];

  // Wait for our turn in the global send queue before issuing this command.
  // Pass the target mac (if present on this request type) so commands aimed
  // at the same physical device get additional spacing from each other.
  const mac = (cmdObj as {mac?: string}).mac;
  const release = await acquireSendSlot(mac);

  // Extract the retry settings specified in the plugin configuration.
  const [maxRetries, socketTimeoutMs] =
      [kNetworkSettings.maxRetries, kNetworkSettings.retryDelayMs];

  try {
    // Retry up to kMaxRetries times to overcome any transient network issues.
    for (let attempt = 0; attempt <= maxRetries && !responses.length; ++attempt) {
      try {
        // Create a socket to service this request.
        const socket = DgramAsPromised.createSocket('udp4');

        // Convert the command to a string representation.
        const sendMsg = JSON.stringify(cmdObj);

        // Send the message. We'll wait for confirmation that it was sent later.
        const sendResult = socket.send(sendMsg, kSendPort, ip);

        // Holds the message parsed from the hub response.
        let response: DeviceResponse;

        do {
          // Set a maximum timeout for the request. If we get a response within
          // the timeout, clear the timeout for the next iteration. Add up to
          // 20% random jitter so that if several devices end up retrying at
          // once (e.g. the hub was briefly overwhelmed during a large scene),
          // their retries don't all land back on the hub in lockstep and
          // re-trigger the same congestion.
          const jitteredTimeoutMs =
              socketTimeoutMs + Math.floor(Math.random() * socketTimeoutMs * 0.2);
          const timer = setTimeout(() => socket.close(), jitteredTimeoutMs);
          const recvMsg = await sendResult && await socket.recv();

          // Try to parse the response and add it to the list of responses.
          if ((response = recvMsg && tryParse(recvMsg.msg.toString()))) {
            responses.push(response);
          }

          // Clear the timeout if we still need to read from the socket.
          if (response && !expectSingleResponse) {
            clearTimeout(timer);
          }
        } while (response && !expectSingleResponse);
      } catch (ex: any) {
        Log.error('Network error:', ex.message);
      }
    }
  } finally {
    // Always release the slot — on success or on error/timeout — so the next
    // queued command is not blocked indefinitely.
    release();
  }

  // Return a series of responses, or an empty array if the op was unsuccessful.
  return responses;
}

// Function to send a request to the hub and receive a single response.
async function sendCommand(
    cmdObj: DeviceRequest, ip: string): Promise<DeviceResponse> {
  // Delegate to the generic function with the expectation of a single response.
  const response = await sendCommandMultiResponse(cmdObj, ip, true);
  return response ? response[0] : response;
}

export class ConnectorHubClient {
  private accessToken: string;

  constructor(
      private readonly config: PlatformConfig,
      private readonly deviceInfo: DeviceInfo,
      private readonly hubIp: string,
      private readonly hubToken: string,
  ) {
    this.accessToken =
        computeAccessToken(this.config.connectorKey, this.hubToken);
  }

  public static getDeviceList(hubIp: string): Promise<DeviceResponse[]> {
    return sendCommandMultiResponse(makeGetDeviceListRequest(), hubIp);
  }

  public static readDeviceState(
      deviceInfo: DeviceInfo, hubIp: string, hubToken: string,
      connectorKey: string): Promise<DeviceResponse> {
    const accessToken = computeAccessToken(connectorKey, hubToken);
    return sendCommand(makeReadDeviceRequest(deviceInfo, accessToken), hubIp);
  }

  public getDeviceState(readType: ReadDeviceType): Promise<DeviceResponse> {
    if (readType === ReadDeviceType.kActive) {
      const activeReq = makeWriteDeviceRequest(
          this.deviceInfo, this.accessToken,
          {operation: DeviceOpCode.kStatusQuery});
      return sendCommand(activeReq, this.hubIp);
    }
    return sendCommand(
        makeReadDeviceRequest(this.deviceInfo, this.accessToken), this.hubIp);
  }

  public setOpenCloseState(op: DeviceOpCode): Promise<DeviceResponse> {
    return this.setDeviceState({operation: op});
  }

  public setTargetPosition(position: number): Promise<DeviceResponse> {
    return this.setDeviceState({targetPosition: position});
  }

  public setTargetAngle(angle: number): Promise<DeviceResponse> {
    return this.setDeviceState({targetAngle: angle});
  }

  public setDeviceState(command: DeviceCmd): Promise<DeviceResponse> {
    const request =
        makeWriteDeviceRequest(this.deviceInfo, this.accessToken, command);
    return sendCommand(request, this.hubIp);
  }
}
