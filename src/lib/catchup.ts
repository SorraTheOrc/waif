import cronParser from 'cron-parser';

export function computePrevNext(schedule: string, now = new Date()): { prev?: Date; next?: Date } {
  const anyParser = cronParser as any;
  const opts = { strict: false, currentDate: now };
  let next: Date | undefined;
  let prev: Date | undefined;

  const parse = (() => {
    if (typeof anyParser?.parseExpression === 'function') return (expr: string) => anyParser.parseExpression(expr, opts);
    if (typeof anyParser?.parse === 'function') return (expr: string) => anyParser.parse(expr, opts);
    if (typeof anyParser?.default?.parseExpression === 'function') return (expr: string) => anyParser.default.parseExpression(expr, opts);
    if (typeof anyParser?.default?.parse === 'function') return (expr: string) => anyParser.default.parse(expr, opts);
    if (typeof anyParser === 'function') {
      return (expr: string) => {
        try { return anyParser(expr, opts); } catch (e) {
          const msg = String((e as any)?.message || '');
          if (msg.includes("cannot be invoked without 'new'") || msg.includes('Class constructor')) {
            // eslint-disable-next-line new-cap
            return new anyParser(expr, opts);
          }
          throw e;
        }
      };
    }
    throw new Error('cron-parser parse function not found');
  })();

  const iter = parse(schedule);
  const maybeNext = iter.next ? iter.next() : null;
  if (maybeNext) {
    if (typeof maybeNext.toDate === 'function') next = maybeNext.toDate();
    else if (maybeNext instanceof Date) next = maybeNext;
    else if (maybeNext.value && typeof maybeNext.value.toDate === 'function') next = maybeNext.value.toDate();
    else if (maybeNext.value && maybeNext.value instanceof Date) next = maybeNext.value;
    else next = new Date(String(maybeNext));
  }

  if (typeof iter.prev === 'function') {
    try {
      const maybePrev = iter.prev();
      if (maybePrev) {
        if (typeof maybePrev.toDate === 'function') prev = maybePrev.toDate();
        else if (maybePrev instanceof Date) prev = maybePrev;
        else if (maybePrev.value && typeof maybePrev.value.toDate === 'function') prev = maybePrev.value.toDate();
        else if (maybePrev.value && maybePrev.value instanceof Date) prev = maybePrev.value;
        else prev = new Date(String(maybePrev));
      }
    } catch {
      // prev computation failed; leave undefined
    }
  }

  return { prev, next };
}
