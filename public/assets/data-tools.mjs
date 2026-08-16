export const IMPORT_FILE_LIMIT = 40 * 1024 * 1024;

function defaultDownload(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportData({
  api,
  confirmFn = (message) => window.confirm(message),
  download = defaultDownload,
}) {
  if (!confirmFn('导出文件包含未加密的家庭健康资料和舌象照片。确认导出并自行妥善保管吗？')) return false;
  const { filename, data } = await api('/api/data/export');
  download(filename, `${JSON.stringify(data)}\n`);
  return true;
}

export async function importData({
  api,
  file,
  confirmFn = (message) => window.confirm(message),
}) {
  if (!file) return false;
  if (file.size > IMPORT_FILE_LIMIT) throw new Error('备份文件不能超过 40 MiB');
  if (file.type && file.type !== 'application/json' && file.type !== 'text/json') throw new Error('请选择 JSON 备份文件');
  if (file.name && !file.name.toLowerCase().endsWith('.json')) throw new Error('请选择 JSON 备份文件');
  if (!confirmFn('导入会用此未加密备份替换当前浏览器中的全部家庭资料、照片和历史。确认继续吗？')) return false;
  let data;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    data = JSON.parse(text);
  } catch (_) {
    throw new Error('备份文件不是有效的 UTF-8 JSON');
  }
  await api('/api/data/import', { method: 'POST', body: data });
  return true;
}
