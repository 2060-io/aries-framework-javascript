import type { FeatureRegistry } from '../../agent/FeatureRegistry'
import type { ApiModule, DependencyManager } from '../../plugins'
import type { Constructor } from '../../utils/mixins'
import type { Optional } from '../../utils/type'
import type { CredentialsModuleConfigOptions } from './CredentialsModuleConfig'
import type { CredentialProtocol } from './protocol/CredentialProtocol'

import { Protocol } from '../../agent/models'

import { CredentialsApi } from './CredentialsApi'
import { CredentialsModuleConfig } from './CredentialsModuleConfig'
import { IndyCredentialFormatService } from './formats/indy'
import { RevocationNotificationService } from './protocol/revocation-notification/services'
import { V1CredentialProtocol } from './protocol/v1'
import { V2CredentialProtocol } from './protocol/v2'
import { CredentialRepository } from './repository'

/**
 * Default credentialProtocols that will be registered if the `credentialProtocols` property is not configured.
 */
export type DefaultCredentialProtocols = [V1CredentialProtocol, V2CredentialProtocol<IndyCredentialFormatService[]>]

// CredentialModuleOptions makes the credentialProtocols property optional from the config, as it will set it when not provided.
export type CredentialsModuleOptions<CredentialProtocols extends CredentialProtocol[]> = Optional<
  CredentialsModuleConfigOptions<CredentialProtocols>,
  'credentialProtocols'
>

export class CredentialsModule<CredentialProtocols extends CredentialProtocol[] = DefaultCredentialProtocols>
  implements ApiModule
{
  public readonly config: CredentialsModuleConfig<CredentialProtocols>

  // Infer Api type from the config
  public readonly api: Constructor<CredentialsApi<CredentialProtocols>> = CredentialsApi

  public constructor(config?: CredentialsModuleOptions<CredentialProtocols>) {
    this.config = new CredentialsModuleConfig({
      ...config,
      // NOTE: the credentialProtocols defaults are set in the CredentialsModule rather than the CredentialsModuleConfig to
      // void dependency cycles.
      credentialProtocols: config?.credentialProtocols ?? this.getDefaultCredentialProtocols(),
    }) as CredentialsModuleConfig<CredentialProtocols>
  }

  /**
   * Get the default credential protocols that will be registered if the `credentialProtocols` property is not configured.
   */
  private getDefaultCredentialProtocols(): DefaultCredentialProtocols {
    // Instantiate credential formats
    const indyCredentialFormat = new IndyCredentialFormatService()

    // Instantiate credential protocols
    const v1CredentialProtocol = new V1CredentialProtocol({ indyCredentialFormat })
    const v2CredentialProtocol = new V2CredentialProtocol({
      credentialFormats: [indyCredentialFormat],
    })

    return [v1CredentialProtocol, v2CredentialProtocol]
  }

  /**
   * Registers the dependencies of the credentials module on the dependency manager.
   */
  public register(dependencyManager: DependencyManager, featureRegistry: FeatureRegistry) {
    // Api
    dependencyManager.registerContextScoped(CredentialsApi)

    // Config
    dependencyManager.registerInstance(CredentialsModuleConfig, this.config)

    // Services
    dependencyManager.registerSingleton(RevocationNotificationService)

    // Repositories
    dependencyManager.registerSingleton(CredentialRepository)

    // Features
    featureRegistry.register(
      new Protocol({
        id: 'https://didcomm.org/revocation_notification/1.0',
        roles: ['holder'],
      }),
      new Protocol({
        id: 'https://didcomm.org/revocation_notification/2.0',
        roles: ['holder'],
      })
    )

    // Protocol needs to register feature registry items and handlers
    for (const credentialProtocol of this.config.credentialProtocols) {
      credentialProtocol.register(dependencyManager, featureRegistry)
    }
  }
}
