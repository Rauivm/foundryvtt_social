export interface SocialTab {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  getData(): Promise<Record<string, unknown>> | Record<string, unknown>;
  activateListeners(root: HTMLElement): void;
}
