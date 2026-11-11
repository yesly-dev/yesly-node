/** One page of a list, as the API returns it, plus helpers to walk the rest. */
export class Page<T extends object> implements AsyncIterable<T> {
  readonly object = "list" as const;
  readonly url: string;
  readonly has_more: boolean;
  readonly data: T[];

  constructor(
    raw: { url: string; has_more: boolean; data: T[] },
    private readonly fetchAfter: (startingAfter: string) => Promise<Page<T>>,
  ) {
    this.url = raw.url;
    this.has_more = raw.has_more;
    this.data = raw.data;
  }

  hasNextPage(): boolean {
    return this.has_more && this.data.length > 0;
  }

  /** The page after this one. Check `hasNextPage()` first. */
  nextPage(): Promise<Page<T>> {
    // Lists that come whole, in one page (a conversation's turns), have items without an id.
    const last = this.data.at(-1) as { id?: unknown } | undefined;
    if (!this.has_more || typeof last?.id !== "string") throw new Error("There is no next page.");
    return this.fetchAfter(last.id);
  }

  /** Every item from this page on, fetching later pages as needed. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> = this;
    for (;;) {
      yield* page.data;
      if (!page.hasNextPage()) return;
      page = await page.nextPage();
    }
  }

  toJSON() {
    return { object: this.object, url: this.url, has_more: this.has_more, data: this.data };
  }
}

/**
 * What list methods return: await it for the first page, or iterate it with
 * `for await` to get every item across pages.
 */
export class PagePromise<T extends object> implements PromiseLike<Page<T>>, AsyncIterable<T> {
  private readonly first: Promise<Page<T>>;

  constructor(load: () => Promise<Page<T>>) {
    this.first = load();
    // Avoid an unhandled rejection when the caller only iterates.
    this.first.catch(() => {});
  }

  then<A = Page<T>, B = never>(onfulfilled?: ((value: Page<T>) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return this.first.then(onfulfilled, onrejected);
  }

  catch<B = never>(onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<Page<T> | B> {
    return this.first.catch(onrejected);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* await this.first;
  }
}
