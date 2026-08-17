import { describe, it, expect, beforeEach } from 'vitest';
import { canApplySilently } from './registerServiceWorker.js';

// This gate decides whether an update may reload the page with nobody watching.
// Getting it wrong in the permissive direction destroys whatever the user had
// typed, so the "don't" cases matter more than the "do" case.
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  setVisibility('hidden');
});

describe('canApplySilently', () => {
  it('allows it when the tab is hidden and nothing is half-typed', () => {
    expect(canApplySilently()).toBe(true);
  });

  it('refuses while the tab is visible, so the page is never yanked mid-use', () => {
    setVisibility('visible');
    expect(canApplySilently()).toBe(false);
  });

  it('refuses when a text input has content', () => {
    document.body.innerHTML = '<input type="text" />';
    document.querySelector('input').value = 'Software Engineer';
    expect(canApplySilently()).toBe(false);
  });

  it('refuses when a textarea has content', () => {
    document.body.innerHTML = '<textarea></textarea>';
    document.querySelector('textarea').value = 'my cover letter so far';
    expect(canApplySilently()).toBe(false);
  });

  it('refuses while a dialog is open, whose state is not in a field at all', () => {
    document.body.innerHTML = '<div role="dialog"><p>Edit profile</p></div>';
    expect(canApplySilently()).toBe(false);
  });

  it('ignores empty and whitespace-only fields', () => {
    document.body.innerHTML = '<input type="text" /><textarea></textarea>';
    document.querySelector('input').value = '   ';
    expect(canApplySilently()).toBe(true);
  });

  it('ignores checkboxes and radios, whose value is set even when untouched', () => {
    // <input type="checkbox"> reports value "on" by default; treating that as
    // unsaved work would block the update on almost every screen.
    document.body.innerHTML = `
      <input type="checkbox" />
      <input type="radio" />
      <input type="hidden" value="csrf-token" />
    `;
    expect(canApplySilently()).toBe(true);
  });

  it('refuses if any one field of several has content', () => {
    document.body.innerHTML = '<input type="text" /><input type="email" /><input type="tel" />';
    document.querySelectorAll('input')[1].value = 'me@example.com';
    expect(canApplySilently()).toBe(false);
  });
});
