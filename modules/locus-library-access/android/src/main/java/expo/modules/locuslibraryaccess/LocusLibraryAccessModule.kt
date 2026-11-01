package expo.modules.locuslibraryaccess

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LocusLibraryAccessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LocusLibraryAccess")

    Function("extractEntitiesAndTags") { _: String ->
      emptyList<String>()
    }
  }
}
