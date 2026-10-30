const DEFAULT_PAGE_SIZE = 500;

/** Fetch every row from a Supabase query in bounded, ordered pages. */
export async function fetchAllPages(queryFactory, pageSize = DEFAULT_PAGE_SIZE) {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
