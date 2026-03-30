/* ========================================
   Tag Component
   ======================================== */

/**
 * Create a tag element
 * @param {string} text - tag label
 * @param {boolean} active - is tag active
 * @param {Function} onClick - click handler
 * @returns {HTMLElement}
 */
export function createTag(text, active = false, onClick = null) {
  const tag = document.createElement('span');
  tag.className = 'tag' + (active ? ' active' : '');
  tag.textContent = text;
  tag.dataset.tag = text;

  if (onClick) {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(text);
    });
  }

  return tag;
}

/**
 * Create multiple tags from array
 * @param {string[]} tags - array of tag strings
 * @param {Function} onClick - click handler
 * @returns {DocumentFragment}
 */
export function createTags(tags, onClick = null) {
  const fragment = document.createDocumentFragment();

  for (const tag of tags) {
    const tagEl = createTag(tag, false, onClick);
    fragment.appendChild(tagEl);
  }

  return fragment;
}
