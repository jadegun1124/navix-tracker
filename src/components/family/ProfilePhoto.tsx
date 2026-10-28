import { MemberAvatar } from './MemberAvatar';

export async function cropProfilePhoto(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/') || file.size > 8_000_000) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('image'));
      next.src = url;
    });
    if (image.width < 1 || image.height < 1) return null;
    const side = Math.min(image.width, image.height);
    const sx = (image.width - side) / 2;
    const sy = (image.height - side) / 2;
    const attempts = [
      { size: 96, quality: 0.72 },
      { size: 96, quality: 0.5 },
      { size: 64, quality: 0.5 },
    ];
    let best: string | null = null;
    for (const attempt of attempts) {
      const canvas = document.createElement('canvas');
      canvas.width = attempt.size;
      canvas.height = attempt.size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(image, sx, sy, side, side, 0, 0, attempt.size, attempt.size);
      best = canvas.toDataURL('image/jpeg', attempt.quality);
      if (best.length <= 24_000) return best;
    }
    return best && best.length <= 24_000 ? best : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoPicker({
  name,
  photo,
  onPhoto,
}: {
  name: string;
  photo?: string | null;
  onPhoto: (photo: string) => void;
}) {
  return (
    <label className="relative block h-11 w-11 shrink-0 cursor-pointer" aria-label="프로필 사진">
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void cropProfilePhoto(file).then((next) => {
            if (next) onPhoto(next);
          });
        }}
      />
      <MemberAvatar name={name} photo={photo} />
    </label>
  );
}
