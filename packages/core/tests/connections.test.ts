/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { SubjectMessage } from '../../../tests/transport/SubjectInboundTransport'
import type { AgentMessageProcessedEvent, KeylistUpdate } from '../src'

import { filter, firstValueFrom, map, Subject, timeout } from 'rxjs'

import { SubjectInboundTransport } from '../../../tests/transport/SubjectInboundTransport'
import { SubjectOutboundTransport } from '../../../tests/transport/SubjectOutboundTransport'
import {
  Key,
  AgentEventTypes,
  KeylistUpdateMessage,
  DidExchangeState,
  HandshakeProtocol,
  KeylistUpdateAction,
} from '../src'
import { Agent } from '../src/agent/Agent'
import { didKeyToVerkey } from '../src/modules/dids/helpers'
import { OutOfBandState } from '../src/modules/oob/domain/OutOfBandState'

import { getAgentOptions } from './helpers'

describe('connections', () => {
  let faberAgent: Agent
  let aliceAgent: Agent
  let acmeAgent: Agent
  let mediatorAgent: Agent

  beforeEach(async () => {
    const faberAgentOptions = getAgentOptions('Faber Agent Connections', {
      endpoints: ['rxjs:faber'],
    })
    const aliceAgentOptions = getAgentOptions('Alice Agent Connections', {
      endpoints: ['rxjs:alice'],
    })
    const acmeAgentOptions = getAgentOptions('Acme Agent Connections', {
      endpoints: ['rxjs:acme'],
    })
    const mediatorAgentOptions = getAgentOptions('Mediator Agent Connections', {
      endpoints: ['rxjs:mediator'],
      autoAcceptMediationRequests: true,
    })

    const faberMessages = new Subject<SubjectMessage>()
    const aliceMessages = new Subject<SubjectMessage>()
    const acmeMessages = new Subject<SubjectMessage>()
    const mediatorMessages = new Subject<SubjectMessage>()

    const subjectMap = {
      'rxjs:faber': faberMessages,
      'rxjs:alice': aliceMessages,
      'rxjs:acme': acmeMessages,
      'rxjs:mediator': mediatorMessages,
    }

    faberAgent = new Agent(faberAgentOptions)
    faberAgent.registerInboundTransport(new SubjectInboundTransport(faberMessages))
    faberAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await faberAgent.initialize()

    aliceAgent = new Agent(aliceAgentOptions)
    aliceAgent.registerInboundTransport(new SubjectInboundTransport(aliceMessages))
    aliceAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await aliceAgent.initialize()

    acmeAgent = new Agent(acmeAgentOptions)
    acmeAgent.registerInboundTransport(new SubjectInboundTransport(acmeMessages))
    acmeAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await acmeAgent.initialize()

    mediatorAgent = new Agent(mediatorAgentOptions)
    mediatorAgent.registerInboundTransport(new SubjectInboundTransport(mediatorMessages))
    mediatorAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await mediatorAgent.initialize()
  })

  afterEach(async () => {
    await faberAgent.shutdown()
    await faberAgent.wallet.delete()
    await aliceAgent.shutdown()
    await aliceAgent.wallet.delete()
    await acmeAgent.shutdown()
    await acmeAgent.wallet.delete()
    await mediatorAgent.shutdown()
    await mediatorAgent.wallet.delete()
  })

  it('one should be able to make multiple connections using a multi use invite', async () => {
    const faberOutOfBandRecord = await faberAgent.oob.createInvitation({
      handshakeProtocols: [HandshakeProtocol.Connections],
      multiUseInvitation: true,
    })

    const invitation = faberOutOfBandRecord.outOfBandInvitation
    const invitationUrl = invitation.toUrl({ domain: 'https://example.com' })

    // Receive invitation first time with alice agent
    let { connectionRecord: aliceFaberConnection } = await aliceAgent.oob.receiveInvitationFromUrl(invitationUrl)
    aliceFaberConnection = await aliceAgent.connections.returnWhenIsConnected(aliceFaberConnection!.id)
    expect(aliceFaberConnection.state).toBe(DidExchangeState.Completed)

    // Receive invitation second time with acme agent
    let { connectionRecord: acmeFaberConnection } = await acmeAgent.oob.receiveInvitationFromUrl(invitationUrl, {
      reuseConnection: false,
    })
    acmeFaberConnection = await acmeAgent.connections.returnWhenIsConnected(acmeFaberConnection!.id)
    expect(acmeFaberConnection.state).toBe(DidExchangeState.Completed)

    let faberAliceConnection = await faberAgent.connections.getByThreadId(aliceFaberConnection.threadId!)
    let faberAcmeConnection = await faberAgent.connections.getByThreadId(acmeFaberConnection.threadId!)

    faberAliceConnection = await faberAgent.connections.returnWhenIsConnected(faberAliceConnection.id)
    faberAcmeConnection = await faberAgent.connections.returnWhenIsConnected(faberAcmeConnection.id)

    expect(faberAliceConnection).toBeConnectedWith(aliceFaberConnection)
    expect(faberAcmeConnection).toBeConnectedWith(acmeFaberConnection)

    expect(faberAliceConnection.id).not.toBe(faberAcmeConnection.id)

    return expect(faberOutOfBandRecord.state).toBe(OutOfBandState.AwaitResponse)
  })

  it('tag connections with multiple types and query them', async () => {
    const faberOutOfBandRecord = await faberAgent.oob.createInvitation({
      handshakeProtocols: [HandshakeProtocol.Connections],
      multiUseInvitation: true,
    })

    const invitation = faberOutOfBandRecord.outOfBandInvitation
    const invitationUrl = invitation.toUrl({ domain: 'https://example.com' })

    // Receive invitation first time with alice agent
    let { connectionRecord: aliceFaberConnection } = await aliceAgent.oob.receiveInvitationFromUrl(invitationUrl)
    aliceFaberConnection = await aliceAgent.connections.returnWhenIsConnected(aliceFaberConnection!.id)
    expect(aliceFaberConnection.state).toBe(DidExchangeState.Completed)

    // Mark connection with three different types
    aliceFaberConnection = await aliceAgent.connections.addConnectionType(aliceFaberConnection.id, 'alice-faber-1')
    aliceFaberConnection = await aliceAgent.connections.addConnectionType(aliceFaberConnection.id, 'alice-faber-2')
    aliceFaberConnection = await aliceAgent.connections.addConnectionType(aliceFaberConnection.id, 'alice-faber-3')

    // Now search for them
    let connectionsFound = await aliceAgent.connections.findAllByConnectionTypes(['alice-faber-4'])
    expect(connectionsFound).toEqual([])
    connectionsFound = await aliceAgent.connections.findAllByConnectionTypes(['alice-faber-1'])
    expect(connectionsFound.map((item) => item.id)).toMatchObject([aliceFaberConnection.id])
    connectionsFound = await aliceAgent.connections.findAllByConnectionTypes(['alice-faber-2'])
    expect(connectionsFound.map((item) => item.id)).toMatchObject([aliceFaberConnection.id])
    connectionsFound = await aliceAgent.connections.findAllByConnectionTypes(['alice-faber-3'])
    expect(connectionsFound.map((item) => item.id)).toMatchObject([aliceFaberConnection.id])
    connectionsFound = await aliceAgent.connections.findAllByConnectionTypes(['alice-faber-1', 'alice-faber-3'])
    expect(connectionsFound.map((item) => item.id)).toMatchObject([aliceFaberConnection.id])
    connectionsFound = await aliceAgent.connections.findAllByConnectionTypes([
      'alice-faber-1',
      'alice-faber-2',
      'alice-faber-3',
    ])
    expect(connectionsFound.map((item) => item.id)).toMatchObject([aliceFaberConnection.id])
    connectionsFound = await aliceAgent.connections.findAllByConnectionTypes(['alice-faber-1', 'alice-faber-4'])
    expect(connectionsFound).toEqual([])
  })

  xit('should be able to make multiple connections using a multi use invite', async () => {
    const faberOutOfBandRecord = await faberAgent.oob.createInvitation({
      handshakeProtocols: [HandshakeProtocol.Connections],
      multiUseInvitation: true,
    })

    const invitation = faberOutOfBandRecord.outOfBandInvitation
    const invitationUrl = invitation.toUrl({ domain: 'https://example.com' })

    // Create first connection
    let { connectionRecord: aliceFaberConnection1 } = await aliceAgent.oob.receiveInvitationFromUrl(invitationUrl)
    aliceFaberConnection1 = await aliceAgent.connections.returnWhenIsConnected(aliceFaberConnection1!.id)
    expect(aliceFaberConnection1.state).toBe(DidExchangeState.Completed)

    // Create second connection
    let { connectionRecord: aliceFaberConnection2 } = await aliceAgent.oob.receiveInvitationFromUrl(invitationUrl, {
      reuseConnection: false,
    })
    aliceFaberConnection2 = await aliceAgent.connections.returnWhenIsConnected(aliceFaberConnection2!.id)
    expect(aliceFaberConnection2.state).toBe(DidExchangeState.Completed)

    let faberAliceConnection1 = await faberAgent.connections.getByThreadId(aliceFaberConnection1.threadId!)
    let faberAliceConnection2 = await faberAgent.connections.getByThreadId(aliceFaberConnection2.threadId!)

    faberAliceConnection1 = await faberAgent.connections.returnWhenIsConnected(faberAliceConnection1.id)
    faberAliceConnection2 = await faberAgent.connections.returnWhenIsConnected(faberAliceConnection2.id)

    expect(faberAliceConnection1).toBeConnectedWith(aliceFaberConnection1)
    expect(faberAliceConnection2).toBeConnectedWith(aliceFaberConnection2)

    expect(faberAliceConnection1.id).not.toBe(faberAliceConnection2.id)

    return expect(faberOutOfBandRecord.state).toBe(OutOfBandState.AwaitResponse)
  })

  it('agent using mediator should be able to make multiple connections using a multi use invite', async () => {
    // Make Faber use a mediator
    const { outOfBandInvitation: mediatorOutOfBandInvitation } = await mediatorAgent.oob.createInvitation({})
    let { connectionRecord } = await faberAgent.oob.receiveInvitation(mediatorOutOfBandInvitation)
    connectionRecord = await faberAgent.connections.returnWhenIsConnected(connectionRecord!.id)
    await faberAgent.mediationRecipient.provision(connectionRecord!)
    await faberAgent.mediationRecipient.initialize()

    // Create observable for event
    const keyAddMessageObservable = mediatorAgent.events
      .observable<AgentMessageProcessedEvent>(AgentEventTypes.AgentMessageProcessed)
      .pipe(
        filter((event) => event.payload.message.type === KeylistUpdateMessage.type.messageTypeUri),
        map((event) => event.payload.message as KeylistUpdateMessage),
        timeout(5000)
      )

    const keylistAddEvents: KeylistUpdate[] = []
    keyAddMessageObservable.subscribe((value) => {
      value.updates.forEach((update) =>
        keylistAddEvents.push({ action: update.action, recipientKey: didKeyToVerkey(update.recipientKey) })
      )
    })

    // Now create invitations that will be mediated
    const faberOutOfBandRecord = await faberAgent.oob.createInvitation({
      handshakeProtocols: [HandshakeProtocol.Connections],
      multiUseInvitation: true,
    })

    const invitation = faberOutOfBandRecord.outOfBandInvitation
    const invitationUrl = invitation.toUrl({ domain: 'https://example.com' })

    // Receive invitation first time with alice agent
    let { connectionRecord: aliceFaberConnection } = await aliceAgent.oob.receiveInvitationFromUrl(invitationUrl)
    aliceFaberConnection = await aliceAgent.connections.returnWhenIsConnected(aliceFaberConnection!.id)
    expect(aliceFaberConnection.state).toBe(DidExchangeState.Completed)

    // Receive invitation second time with acme agent
    let { connectionRecord: acmeFaberConnection } = await acmeAgent.oob.receiveInvitationFromUrl(invitationUrl, {
      reuseConnection: false,
    })
    acmeFaberConnection = await acmeAgent.connections.returnWhenIsConnected(acmeFaberConnection!.id)
    expect(acmeFaberConnection.state).toBe(DidExchangeState.Completed)

    let faberAliceConnection = await faberAgent.connections.getByThreadId(aliceFaberConnection.threadId!)
    let faberAcmeConnection = await faberAgent.connections.getByThreadId(acmeFaberConnection.threadId!)

    faberAliceConnection = await faberAgent.connections.returnWhenIsConnected(faberAliceConnection.id)
    faberAcmeConnection = await faberAgent.connections.returnWhenIsConnected(faberAcmeConnection.id)

    expect(faberAliceConnection).toBeConnectedWith(aliceFaberConnection)
    expect(faberAcmeConnection).toBeConnectedWith(acmeFaberConnection)

    expect(faberAliceConnection.id).not.toBe(faberAcmeConnection.id)

    expect(faberOutOfBandRecord.state).toBe(OutOfBandState.AwaitResponse)

    // Mediator should have received all new keys (the one of the invitation + the ones generated on each connection)
    expect(keylistAddEvents.length).toEqual(3)

    expect(keylistAddEvents).toEqual(
      expect.arrayContaining([
        {
          action: KeylistUpdateAction.add,
          recipientKey: Key.fromFingerprint(faberOutOfBandRecord.getTags().recipientKeyFingerprints[0]).publicKeyBase58,
        },
        {
          action: KeylistUpdateAction.add,
          recipientKey: (await faberAgent.dids.resolveDidDocument(faberAliceConnection.did!)).recipientKeys[0]
            .publicKeyBase58,
        },
        {
          action: KeylistUpdateAction.add,
          recipientKey: (await faberAgent.dids.resolveDidDocument(faberAcmeConnection.did!)).recipientKeys[0]
            .publicKeyBase58,
        },
      ])
    )

    for (const connection of [faberAcmeConnection, faberAliceConnection]) {
      const keyRemoveMessagePromise = firstValueFrom(
        mediatorAgent.events.observable<AgentMessageProcessedEvent>(AgentEventTypes.AgentMessageProcessed).pipe(
          filter((event) => event.payload.message.type === KeylistUpdateMessage.type.messageTypeUri),
          map((event) => event.payload.message as KeylistUpdateMessage),
          timeout(5000)
        )
      )

      await faberAgent.connections.deleteById(connection.id)

      const keyRemoveMessage = await keyRemoveMessagePromise
      expect(keyRemoveMessage.updates.length).toEqual(1)

      expect(
        keyRemoveMessage.updates.map((update) => ({
          action: update.action,
          recipientKey: didKeyToVerkey(update.recipientKey),
        }))[0]
      ).toEqual({
        action: KeylistUpdateAction.remove,
        recipientKey: (await faberAgent.dids.resolveDidDocument(connection.did!)).recipientKeys[0].publicKeyBase58,
      })
    }
  })
})
