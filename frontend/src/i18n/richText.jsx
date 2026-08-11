import { Fragment } from 'react';

/**
 * Renders a translated string that contains <b>…</b> emphasis as React nodes.
 *
 * Several strings need a bolded number mid-sentence ("you used **5** of **10**").
 * The alternatives were both bad: concatenating JSX fragments around the value
 * bakes Hebrew word order into the component, and dangerouslySetInnerHTML puts an
 * HTML sink on the translation path. This parses exactly one tag and nothing else,
 * so there is no sink — anything that is not <b>/</b> stays literal text.
 *
 *   renderRich(t('limit.usedOfFree', { used, limit }))
 */
export function renderRich(text) {
  if (typeof text !== 'string') return text;

  const parts = text.split(/<b>|<\/b>/);
  // Odd indices are the spans that sat between <b> and </b>.
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i}>{part}</strong>
      : <Fragment key={i}>{part}</Fragment>,
  );
}

export default renderRich;
