import api from '../api/client';

export async function getOrderDocumentUrl(orderId, kind) {
  const { data } = await api.get(`/orders/${orderId}/documents/${kind}/download`);
  return data?.download_url || data?.url || null;
}

export async function openOrderDocument(orderId, kind) {
  const url = await getOrderDocumentUrl(orderId, kind);
  if (!url) {
    throw new Error('Документ пока недоступен');
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

export function openExistingDocument(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
