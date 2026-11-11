// What `react-native` is under vitest. The real package ships Flow-typed
// source that a plain node test run cannot parse, and the unit tests cover
// logic, not rendering — so modules that only read Platform get this instead.
// Add a member here when a tested module needs one; a test that needs real
// components belongs in the screenshot checks (TEAM.md), not here.
export const Platform = {
  OS: 'android' as const,
  select: <T,>(spec: { android?: T; default?: T }): T | undefined => spec.android ?? spec.default,
};
