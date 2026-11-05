// The browser tab's title: "Dashboard · For Wealth". React moves it into the
// document head, ahead of index.html's plain "For Wealth".
export function PageTitle({ children }: { children: string }) {
  return <title>{`${children} · For Wealth`}</title>
}
