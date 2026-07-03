/* ========================================
   Editable Follow-up Rows
   ======================================== */

import { updateFollowup } from '../api.js?v=20260703g';

export function buildEditableFollowupRow(item, options = {}) {
  const statusLabel = item.overdue ? '超时' : ({
    open: 'open',
    deferred: 'deferred',
    closed: 'closed',
    dropped: 'dropped'
  }[item.status] || item.status || 'open');
  const context = options.contextLabel?.(item) || buildFollowupContextMeta(item);

  return `
    <div class="compact-row followup-editable-row ${item.overdue ? 'is-overdue' : ''}" data-followup-id="${escapeAttr(item.id)}">
      <div class="followup-row-main">
        <strong>${escapeHtml(item.text)}</strong>
        <span>${escapeHtml(context)}</span>
        <span class="followup-time-meta">${escapeHtml(buildFollowupTimeMeta(item))}</span>
        ${item.note ? `<span class="followup-note">备注：${escapeHtml(item.note)}</span>` : ''}
      </div>
      <div class="row-actions">
        <em>${escapeHtml(statusLabel)}</em>
        <button type="button" data-followup-edit="open">编辑</button>
        ${item.status === 'open' ? '<button type="button" data-followup-action="deferred">延后</button>' : '<button type="button" data-followup-action="open">打开</button>'}
        <button type="button" data-followup-action="closed">完成</button>
        <button type="button" data-followup-action="dropped">放弃</button>
      </div>
      <form class="followup-edit-form" data-followup-edit-form hidden>
        <label>
          <span>事项名称</span>
          <input name="text" value="${escapeAttr(item.text)}" required>
        </label>
        <label>
          <span>计划时间</span>
          <input name="dueDate" type="date" value="${escapeAttr(formatDateOnly(item.dueDate))}">
        </label>
        <label class="followup-edit-note">
          <span>备注</span>
          <textarea name="note" rows="2">${escapeHtml(item.note || '')}</textarea>
        </label>
        <div class="followup-edit-actions">
          <button type="submit">保存</button>
          <button type="button" data-followup-edit="cancel">取消</button>
        </div>
      </form>
    </div>
  `;
}

export function bindEditableFollowupList(list, options = {}) {
  if (!list) return;

  list.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-followup-edit]');
    if (editButton) {
      handleEditToggle(editButton);
      return;
    }

    const actionButton = event.target.closest('[data-followup-action]');
    if (!actionButton) return;

    const row = actionButton.closest('[data-followup-id]');
    const id = row?.dataset.followupId;
    if (!id) return;

    const nextStatus = actionButton.dataset.followupAction;
    actionButton.disabled = true;
    setStatus(options.statusEl, '更新中...');

    try {
      const data = await updateFollowup(id, { status: nextStatus });
      if (nextStatus === 'closed' || nextStatus === 'dropped') {
        row.remove();
        ensureEmptyState(list, options.emptyText || '暂无在线待办。');
      } else {
        row.outerHTML = buildEditableFollowupRow(data.followup, options);
      }
      setStatus(options.statusEl, '已更新');
    } catch (error) {
      setStatus(options.statusEl, error.message || '更新失败');
      actionButton.disabled = false;
    }
  });

  list.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-followup-edit-form]');
    if (!form) return;
    event.preventDefault();

    const row = form.closest('[data-followup-id]');
    const id = row?.dataset.followupId;
    const text = form.elements.text.value.trim();
    if (!id || !text) {
      setStatus(options.statusEl, '事项名称不能为空。');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(options.statusEl, '保存中...');

    try {
      const data = await updateFollowup(id, {
        text,
        dueDate: form.elements.dueDate.value,
        note: form.elements.note.value
      });
      row.outerHTML = buildEditableFollowupRow(data.followup, options);
      setStatus(options.statusEl, '已保存');
    } catch (error) {
      setStatus(options.statusEl, error.message || '保存失败');
      button.disabled = false;
    }
  });
}

export function buildFollowupTimeMeta(item) {
  const created = formatDateOnly(item.createdAt || item.sourceDate);
  const due = formatDateOnly(item.dueDate);
  return [
    created ? `创建 ${created}` : '',
    due ? `计划 ${due}` : '计划未定'
  ].filter(Boolean).join(' · ');
}

function handleEditToggle(button) {
  const row = button.closest('[data-followup-id]');
  const form = row?.querySelector('[data-followup-edit-form]');
  if (!form) return;

  if (button.dataset.followupEdit === 'cancel') {
    form.reset();
    form.hidden = true;
    return;
  }

  form.hidden = !form.hidden;
  if (!form.hidden) form.elements.text?.focus();
}

function ensureEmptyState(list, text) {
  if (list.querySelector('[data-followup-id]')) return;
  list.innerHTML = `<div class="empty-inline">${escapeHtml(text)}</div>`;
}

function setStatus(target, text) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (element) element.textContent = text;
}

function buildFollowupContextMeta(item) {
  return [
    item.domainLabel || getDomainLabel(item.domain),
    item.project
  ].filter(Boolean).join(' · ') || '未分类';
}

function getDomainLabel(domain) {
  const labels = {
    work: '主业',
    side_business: '副业',
    life: '生活',
    content: '内容'
  };
  return labels[domain] || domain || '';
}

function formatDateOnly(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
