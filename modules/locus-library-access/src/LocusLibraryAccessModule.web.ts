import { registerWebModule, NativeModule } from 'expo';

class LocusLibraryAccessModule extends NativeModule<{}> {}

export default registerWebModule(LocusLibraryAccessModule, 'LocusLibraryAccessModule');
