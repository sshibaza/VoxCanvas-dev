import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getToken } from '../auth/jwt.js';

const TELEPHONY_API_PATH = '/telephony/v1';
const PROVIDER_NAME = 'voxcanvas';

export class Scrt2Client {
  constructor(config) {
    this.scrtBaseUrl = config.scrtBaseUrl || '';
    this.orgId = config.orgId || '';
    this.callCenterApiName = config.callCenterApiName || '';
    this.privateKeyPath = config.privateKeyPath || '';
    this.callCenterPhone = config.callCenterPhone || '';
  }

  configure({ scrtBaseUrl, orgId, callCenterApiName }) {
    this.scrtBaseUrl = scrtBaseUrl;
    this.orgId = orgId;
    this.callCenterApiName = callCenterApiName;
  }

  isConfigured() {
    return !!(this.scrtBaseUrl && this.orgId && this.callCenterApiName);
  }

  _getHeaders() {
    const token = getToken(this.orgId, this.callCenterApiName, this.privateKeyPath);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Telephony-Provider-Name': PROVIDER_NAME,
    };
  }

  _getClient() {
    return axios.create({
      baseURL: `${this.scrtBaseUrl}${TELEPHONY_API_PATH}`,
    });
  }

  async createVoiceCall({ callType, from, to }) {
    const vendorCallKey = uuidv4();
    const fieldValues = {
      callCenterApiName: this.callCenterApiName,
      initiationMethod: callType === 'inbound' ? 'Inbound' : 'Outbound',
      vendorCallKey,
      to: to || this.callCenterPhone,
      from,
      startTime: new Date().toISOString(),
      participants: [
        {
          participantKey: from,
          type: 'END_USER',
        },
      ],
    };

    const response = await this._getClient().post('/voiceCalls', fieldValues, {
      headers: this._getHeaders(),
    });

    return {
      vendorCallKey,
      voiceCallId: response.data.voiceCallId,
    };
  }

  async updateVoiceCall(voiceCallId, updates) {
    const fieldValues = {};
    if (updates.recordingUrl) fieldValues.recordingLocation = updates.recordingUrl;
    if (updates.endTime) fieldValues.endTime = updates.endTime;
    if (updates.isActiveCall !== undefined) fieldValues.isActiveCall = updates.isActiveCall;
    if (updates.startTime) fieldValues.startTime = updates.startTime;
    if (updates.callOrigin) fieldValues.callOrigin = updates.callOrigin;
    if (updates.totalRecordingDuration !== undefined) fieldValues.totalRecordingDuration = updates.totalRecordingDuration;
    if (updates.agentInteractionDuration !== undefined) fieldValues.agentInteractionDuration = updates.agentInteractionDuration;
    if (updates.totalHoldDuration !== undefined) fieldValues.totalHoldDuration = updates.totalHoldDuration;

    const response = await this._getClient().patch(
      `/voiceCalls/${voiceCallId}`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async createTranscription(vendorCallKey, { content, senderType, messageId, participantId }) {
    const fieldValues = {
      messageId: messageId || uuidv4(),
      content,
      senderType,
      startTime: Date.now(),
      endTime: Date.now() + 25000,
      participantId: participantId || `${vendorCallKey}${senderType}`,
    };

    const response = await this._getClient().post(
      `/voiceCalls/${vendorCallKey}/messages`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async sendRealtimeConversationEvents(vendorCallKey, { service, persist, events }) {
    const timestampedEvents = events.map((event) => ({
      ...event,
      startTime: event.startTime || Date.now(),
    }));

    const fieldValues = {
      service,
      persist,
      events: timestampedEvents,
    };

    const response = await this._getClient().post(
      `/voiceCalls/${vendorCallKey}/realtimeConversationEvents`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async executeOmniFlow(voiceCallId, { dialedNumber, flowName, fallbackQueue }) {
    const fieldValues = {};
    if (dialedNumber) fieldValues.dialedNumber = dialedNumber;
    if (flowName) fieldValues.flowName = flowName;
    if (fallbackQueue) fieldValues.fallbackQueue = fallbackQueue;

    const response = await this._getClient().patch(
      `/voiceCalls/${voiceCallId}/omniFlow`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async sendVoiceMail({ from, to, transcripts, recordingUrl, recordingLength }) {
    // Step 1: Create inbound voice call
    const { vendorCallKey, voiceCallId } = await this.createVoiceCall({
      callType: 'inbound',
      from,
      to,
    });

    // Step 2: Mark as voicemail and active
    await this.updateVoiceCall(voiceCallId, {
      isActiveCall: true,
      callOrigin: 'Voicemail',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 61000).toISOString(),
    });

    // Step 3: Add transcription
    await this.createTranscription(vendorCallKey, {
      content: transcripts,
      senderType: 'END_USER',
    });

    // Step 4: Route through Omni
    await this.executeOmniFlow(voiceCallId, { dialedNumber: to });

    // Step 5: Finalize with recording
    await this.updateVoiceCall(voiceCallId, {
      recordingUrl,
      totalRecordingDuration: parseInt(recordingLength) || 0,
    });

    return { vendorCallKey, voiceCallId };
  }
}
