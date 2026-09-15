import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubscribeButton } from '@/components/seller/SubscribeButton';

/**
 * The subscribe control submits ONLY the plan id to the checkout action; the
 * seller identity comes from the server session (no client-supplied identity).
 */
describe('SubscribeButton', () => {
  it('renders a form whose only field is the plan id, with the given label', () => {
    const html = renderToStaticMarkup(
      createElement(SubscribeButton, {
        planId: 'plan-abc',
        label: 'Choose Starter',
      }),
    );
    expect(html).toContain('<form');
    expect(html).toContain('name="planId"');
    expect(html).toContain('value="plan-abc"');
    expect(html).toContain('Choose Starter');
    const names = html.match(/name="[^"]+"/g) ?? [];
    expect(names).toEqual(['name="planId"']); // no other fields
  });
});
