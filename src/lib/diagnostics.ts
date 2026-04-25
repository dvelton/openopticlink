export interface DiagnosticItem {
  label: string;
  value: string;
  ok: boolean;
}

export async function collectDiagnostics(): Promise<DiagnosticItem[]> {
  const hasCameraApi =
    'mediaDevices' in navigator && typeof navigator.mediaDevices.getUserMedia === 'function';
  const items: DiagnosticItem[] = [
    {
      label: 'Secure context',
      value: window.isSecureContext ? 'yes' : 'no',
      ok: window.isSecureContext,
    },
    {
      label: 'Camera API',
      value: hasCameraApi ? 'available' : 'not available',
      ok: hasCameraApi,
    },
    {
      label: 'Offline install support',
      value: 'serviceWorker' in navigator ? 'available' : 'not available',
      ok: 'serviceWorker' in navigator,
    },
    {
      label: 'Local storage',
      value: storageWorks() ? 'available' : 'not available',
      ok: storageWorks(),
    },
  ];

  if (navigator.mediaDevices?.enumerateDevices) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput').length;
    items.push({
      label: 'Detected cameras',
      value: String(cameras),
      ok: cameras > 0,
    });
  }

  return items;
}

function storageWorks(): boolean {
  const key = 'openopticlink.storage-test';
  localStorage.setItem(key, '1');
  localStorage.removeItem(key);
  return true;
}
