import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app.js';
import { createFixtureDemoApiClient } from './lib/fixture-api.js';

function renderApp() {
  return render(<App client={createFixtureDemoApiClient()} fixtureMode />);
}

function getPanel(name: string): HTMLElement {
  const panel = screen.getByRole('heading', { name }).closest('section');
  if (!panel) throw new Error(`Panel not found: ${name}`);
  return panel;
}

describe('App', () => {
  it('opens as an accessible operations console with canonical case context', () => {
    renderApp();

    expect(
      screen.getByRole('heading', { name: 'Mutex Memory' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ORDER-MUTEX-119')).toBeInTheDocument();
    expect(screen.getByText('Fixture trace')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Safe' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Mock' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Run decision' })).toBeEnabled();
  });

  it('makes the unsafe double-action failure visually explicit', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('radio', { name: 'Unsafe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run decision' }));

    expect(await screen.findByText('DEMO-ONLY / UNSAFE')).toBeInTheDocument();
    expect(
      within(getPanel('Commit result')).getAllByText('MOCK_ACCEPTED_UNSAFE'),
    ).toHaveLength(2);
    expect(screen.getByText('Not committed in Unsafe mode')).toBeInTheDocument();
    expect(screen.getByText('Both conflicting actions accepted')).toBeInTheDocument();
  });

  it('shows the Safe winner, harmless loser, and durable evidence', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Run decision' }));

    expect(
      await within(getPanel('Commit result')).findByText('COMMITTED'),
    ).toBeInTheDocument();
    expect(
      within(getPanel('Commit result')).getByText('ALREADY_COMMITTED'),
    ).toBeInTheDocument();
    expect(screen.getByText('ISSUE_REFUND')).toBeInTheDocument();
    expect(screen.getByText('Primary resolution admitted')).toBeInTheDocument();
    expect(screen.getByText('Episodic memory stored')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });

  it('resets durable evidence without changing selected controls', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('radio', { name: 'Bedrock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run decision' }));
    await screen.findByText('Primary resolution admitted');
    fireEvent.click(screen.getByRole('button', { name: 'Reset case' }));

    expect(await screen.findByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText('No durable decision yet')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Bedrock' })).toBeChecked();
  });
});
