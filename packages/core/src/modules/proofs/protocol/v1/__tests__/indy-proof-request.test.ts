import type { Agent } from '../../../../../agent/Agent'
import type { ConnectionRecord } from '../../../../connections/repository/ConnectionRecord'
import type { ProposeProofOptions } from '../../../models/ModuleOptions'
import type { ProofRecord } from '../../../repository/ProofRecord'
import type { PresentationPreview } from '../models/PresentationPreview'
import type { CredDefId } from 'indy-sdk'

import { setupProofsTest, waitForProofRecord } from '../../../../../../tests/helpers'
import testLogger from '../../../../../../tests/logger'
import { ProofProtocolVersion } from '../../../models/ProofProtocolVersion'
import { ProofState } from '../../../models/ProofState'

describe('Present Proof', () => {
  let faberAgent: Agent
  let aliceAgent: Agent
  let aliceConnection: ConnectionRecord
  let presentationPreview: PresentationPreview
  let faberPresentationRecord: ProofRecord
  let alicePresentationRecord: ProofRecord

  beforeAll(async () => {
    testLogger.test('Initializing the agents')
    ;({ faberAgent, aliceAgent, aliceConnection } = await setupProofsTest('Faber agent', 'Alice agent'))
  })

  afterAll(async () => {
    testLogger.test('Shutting down both agents')
    await faberAgent.shutdown()
    await faberAgent.wallet.delete()
    await aliceAgent.shutdown()
    await aliceAgent.wallet.delete()
  })

  test(`Alice Creates and sends Proof Proposal to Faber`, async () => {
    testLogger.test('Alice sends (v1) proof proposal to Faber')

    const proposeOptions: ProposeProofOptions = {
      connectionId: aliceConnection.id,
      protocolVersion: ProofProtocolVersion.V1_0,
      proofFormats: {
        indy: {
          name: 'ProofRequest',
          nonce: '58d223e5-fc4d-4448-b74c-5eb11c6b558f',
          version: '1.0',
          proofPreview: presentationPreview,
        },
      },
      comment: 'V1 propose proof test',
    }

    alicePresentationRecord = await aliceAgent.proofs.proposeProof(proposeOptions)

    testLogger.test('Faber waits for presentation from Alice')
    faberPresentationRecord = await waitForProofRecord(faberAgent, {
      threadId: alicePresentationRecord.threadId,
      state: ProofState.ProposalReceived,
    })

    console.log('alicePresentationRecord:', alicePresentationRecord)

    expect(faberPresentationRecord.connectionId).toEqual(proposeOptions.connectionId)
    expect(faberPresentationRecord.protocolVersion).toEqual(ProofProtocolVersion.V1_0)
    expect(faberPresentationRecord.state).toEqual(ProofState.ProposalSent)
    expect(faberPresentationRecord.threadId).not.toBeNull()

    // expect(JsonTransformer.toJSON(alicePresentationRecord)).toMatchObject({
    //   createdAt: expect.any(Date),
    //   id: expect.any(String),
    //   proposalMessage: {
    //     '@type': 'https://didcomm.org/present-proof/1.0/propose-presentation',
    //     '@id': expect.any(String),
    //     presentation_proposal: {
    //       '@type': 'https://didcomm.org/present-proof/1.0/presentation-preview',
    //       attributes: [
    //         {
    //           cred_def_id: undefined,
    //           name: 'name',
    //           'mime-type': 'text/plain',
    //           value: 'John',
    //           referent: undefined,
    //         },
    //         {
    //           cred_def_id: undefined,
    //           name: 'age',
    //           'mime-type': 'text/plain',
    //           value: '99',
    //           referent: undefined,
    //         },
    //       ],
    //       predicates: [
    //         // {
    //         //   cred_def_id: credDefId,
    //         //   name: 'age',
    //         //   predicate: '>=',
    //         //   threshold: 50,
    //         // },
    //       ],
    //     },
    //   },
    // })
  })

  // test(`Faber accepts the Proposal send by Alice`, async () => {
  //   const attributes = {
  //     name: new ProofAttributeInfo({
  //       name: 'name',
  //       restrictions: [
  //         new AttributeFilter({
  //           credentialDefinitionId: credDefId,
  //         }),
  //       ],
  //     }),
  //     image_0: new ProofAttributeInfo({
  //       name: 'image_0',
  //       restrictions: [
  //         new AttributeFilter({
  //           credentialDefinitionId: credDefId,
  //         }),
  //       ],
  //     }),
  //     image_1: new ProofAttributeInfo({
  //       name: 'image_1',
  //       restrictions: [
  //         new AttributeFilter({
  //           credentialDefinitionId: credDefId,
  //         }),
  //       ],
  //     }),
  //   }

  //   const predicates = {
  //     age: new ProofPredicateInfo({
  //       name: 'age',
  //       predicateType: PredicateType.GreaterThanOrEqualTo,
  //       predicateValue: 50,
  //       restrictions: [
  //         new AttributeFilter({
  //           credentialDefinitionId: credDefId,
  //         }),
  //       ],
  //     }),
  //   }

  //   // Accept Proposal
  //   const acceptProposalOptions: AcceptProposalOptions = {
  //     proofFormats: {
  //       indy: {
  //         request: {
  //           name: 'proof-request',
  //           version: '1.0',
  //           nonce: '58d223e5-fc4d-4448-b74c-5eb11c6b558f',
  //           requestedAttributes: attributes,
  //           requestedPredicates: predicates,
  //         },
  //       },
  //     },
  //     proofRecordId: faberPresentationRecord.id,
  //     protocolVersion: ProofProtocolVersion.V1_0,
  //   }

  //   testLogger.test('Faber accepts presentation proposal from Alice')
  //   const proofRecord = await faberAgent.proofs.acceptProposal(acceptProposalOptions)

  //   testLogger.test('Alice waits for proof request from Faber')
  //   faberPresentationRecord = await waitForProofRecord(aliceAgent, {
  //     threadId: alicePresentationRecord.threadId,
  //     state: ProofState.RequestReceived,
  //   })

  //   // TODO - Change the object for accept proposal
  //   expect(JsonTransformer.toJSON(alicePresentationRecord)).toMatchObject({
  //     createdAt: expect.any(Date),
  //     id: expect.any(String),
  //     proposalMessage: {
  //       '@type': 'https://didcomm.org/present-proof/1.0/propose-presentation',
  //       '@id': expect.any(String),
  //       presentation_proposal: {
  //         '@type': 'https://didcomm.org/present-proof/1.0/presentation-preview',
  //         attributes: [
  //           {
  //             cred_def_id: undefined,
  //             name: 'name',
  //             'mime-type': 'text/plain',
  //             value: 'John',
  //             referent: undefined,
  //           },
  //           {
  //             cred_def_id: undefined,
  //             name: 'age',
  //             'mime-type': 'text/plain',
  //             value: '99',
  //             referent: undefined,
  //           },
  //         ],
  //         predicates: [
  //           // {
  //           //   cred_def_id: credDefId,
  //           //   name: 'age',
  //           //   predicate: '>=',
  //           //   threshold: 50,
  //           // },
  //         ],
  //       },
  //     },
  //   })
  // })
})
