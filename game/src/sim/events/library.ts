// 事件库 v1 数据。文件由 scripts/build-event-library.mjs 生成，不要手改。
import data from '../../data/events-v1.json';
import type { LibraryEvent } from './types';

const doc = data as unknown as { events: LibraryEvent[] };
export const LIBRARY_EVENTS: readonly LibraryEvent[] = doc.events;
