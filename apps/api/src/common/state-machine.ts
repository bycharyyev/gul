export type TransitionMap<TState extends string> = Readonly<Record<TState, readonly TState[]>>;

export function canTransition<TState extends string>(
  transitions: TransitionMap<TState>,
  from: TState,
  to: TState,
): boolean {
  return transitions[from].includes(to);
}
