<script>
  let { name = 'grid', size = 19 } = $props();
  const paths = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5z',
    queue: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    filter: 'M4 4h16l-6 7v8l-4 2V11z',
    spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    rules: 'M5 3h14v18H5z M9 7h6 M9 12h6 M9 17h4',
    gift: 'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8H7.5A2.5 2.5 0 1 1 10 5.5L12 8z M12 8h4.5A2.5 2.5 0 1 0 14 5.5L12 8z',
    image: 'M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M15 7h.01',
    lab: 'M9 3h6 M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3 M8 15h8',
    arrow: 'M7 17L17 7 M7 7h10v10',
    logout: 'M9 3H4v18h5 M14 8l5 4-5 4 M8 12h11',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    globe: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M3 12h18 M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18',
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.grid} /></svg>
