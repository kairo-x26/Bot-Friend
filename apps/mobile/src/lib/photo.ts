import { MAX_IMAGE_BASE64 } from '@bot-friend/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  uri: string;
  mediaType: 'image/jpeg';
  data: string;
}

const MAX_EDGE = 1024;

/**
 * Lets the user pick one photo, then downscales it to 1024px JPEG so it stays
 * well under the API's ~1 MB limit. Returns null if they cancel.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error('Photo access is off for Bot-Friend. Turn it on in Settings to share photos.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const ctx = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await ctx.renderAsync();
  let saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if ((saved.base64?.length ?? 0) > MAX_IMAGE_BASE64) {
    saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.45, base64: true });
  }
  if (!saved.base64 || saved.base64.length > MAX_IMAGE_BASE64)
    throw new Error('That photo is too large to send.');
  return {
    uri: saved.uri,
    mediaType: 'image/jpeg',
    data: saved.base64.replace(/^data:image\/\w+;base64,/, ''),
  };
}
