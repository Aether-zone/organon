import { PageRequestDTO } from './page-request.js';

export class Pageable<T> {
  private constructor(
    private _items: T[],
    private _totalNumberOfElements: number,
    private _pageRequest: PageRequestDTO,
  ) {}

  get items(): T[] {
    return this._items;
  }

  get totalNumberOfElements(): number {
    return this._totalNumberOfElements;
  }

  get totalNumberOfPages(): number {
    return Math.ceil(this.totalNumberOfElements / this.pageRequest.perPage);
  }

  get pageRequest(): PageRequestDTO {
    return this._pageRequest;
  }

  static of<T>(
    items: T[],
    totalNumberOfElements: number,
    pageRequest: PageRequestDTO,
  ): Pageable<T> {
    return new Pageable<T>(items, totalNumberOfElements, pageRequest);
  }

  /**
   * Without this, serialising a Pageable emits its backing fields — `_items`,
   * `_totalNumberOfElements`, `_pageRequest` — because getters are not own
   * enumerable properties. Callers would see neither the names they expect
   * nor `totalNumberOfPages`, which is computed.
   */
  toJSON(): {
    items: T[];
    totalNumberOfElements: number;
    totalNumberOfPages: number;
    pageRequest: PageRequestDTO;
  } {
    return {
      items: this.items,
      totalNumberOfElements: this.totalNumberOfElements,
      totalNumberOfPages: this.totalNumberOfPages,
      pageRequest: this.pageRequest,
    };
  }
}
