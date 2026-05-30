import { Directory, File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

const mediaDirectoryName = 'media';

function getExtension(asset: ImagePickerAsset) {
  const fileNameExtension = asset.fileName?.match(/\.[a-zA-Z0-9]+$/)?.[0];

  if (fileNameExtension) {
    return fileNameExtension.toLowerCase();
  }

  if (asset.mimeType?.includes('/')) {
    return `.${asset.mimeType.split('/')[1]}`;
  }

  return '.jpg';
}

export async function copyPickedPhotoToAppStorageAsync(asset: ImagePickerAsset, id: string) {
  if (Platform.OS === 'web') {
    return asset.uri;
  }

  const mediaDirectory = new Directory(Paths.document, mediaDirectoryName);
  mediaDirectory.create({ idempotent: true, intermediates: true });

  const source = new File(asset.uri);
  const destination = new File(mediaDirectory, `${id}${getExtension(asset)}`);

  await source.copy(destination, { overwrite: true });

  return destination.uri;
}
