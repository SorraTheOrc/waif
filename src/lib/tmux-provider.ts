export type TmuxPane = { id: string; title: string; session: string; window: string };

export type TmuxProvider = {
  listPanes(): TmuxPane[];
  findPaneForAgent?(agent: { name: string; label?: string; window?: string }): string;
  sendKeysToPane(paneId: string, prompt: string, agentName: string): void;
  attachIfNeeded?(): void;
};

let provider: TmuxProvider = {
  listPanes() {
    return [];
  },
  sendKeysToPane(_paneId: string, _prompt: string, _agentName: string) {
    // headless no-op
    return;
  },
};

export function getTmuxProvider(): TmuxProvider {
  return provider;
}

export function setTmuxProvider(p: TmuxProvider): void {
  provider = p;
}

export default getTmuxProvider;
