import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KeyValue } from '../../../core/models';
import { KeyValueTable } from './key-value-table';

describe('KeyValueTable', () => {
  let fixture: ComponentFixture<KeyValueTable>;
  let emitted: KeyValue[][];

  const rows = (): HTMLElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.row'));
  const cells = (row: HTMLElement) =>
    Array.from(row.querySelectorAll<HTMLInputElement>('input.cell'));

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function render(value: KeyValue[]): Promise<void> {
    fixture.componentRef.setInput('rows', value);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [KeyValueTable] }).compileComponents();
    fixture = TestBed.createComponent(KeyValueTable);
    emitted = [];
    fixture.componentInstance.rowsChange.subscribe((value) => emitted.push(value));
  });

  it('shows one line per row plus an empty one at the end', async () => {
    await render([{ key: 'a', value: '1', enabled: true }]);

    expect(rows()).toHaveLength(2);
    expect(cells(rows()[0]).map((input) => input.value)).toEqual(['a', '1']);
    expect(cells(rows()[1]).map((input) => input.value)).toEqual(['', '']);
  });

  it('reports an edited value without touching the other rows', async () => {
    await render([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ]);

    type(cells(rows()[1])[1], '99');

    expect(emitted).toEqual([
      [
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '99', enabled: true },
      ],
    ]);
  });

  it('toggles a row on and off', async () => {
    await render([{ key: 'a', value: '1', enabled: true }]);

    const check = rows()[0].querySelector<HTMLInputElement>('input.check')!;
    check.checked = false;
    check.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([[{ key: 'a', value: '1', enabled: false }]]);
  });

  it('removes a row', async () => {
    await render([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ]);

    rows()[0].querySelector<HTMLButtonElement>('button.remove')!.click();

    expect(emitted).toEqual([[{ key: 'b', value: '2', enabled: true }]]);
  });

  it('turns the empty line into a real row when typing in it', async () => {
    await render([{ key: 'a', value: '1', enabled: true }]);

    const [keyCell] = cells(rows()[1]);
    type(keyCell, 'nuevo');

    expect(emitted).toEqual([
      [
        { key: 'a', value: '1', enabled: true },
        { key: 'nuevo', value: '', enabled: true },
      ],
    ]);
    expect(keyCell.value).toBe(''); // la línea vacía queda lista para otra fila
  });

  it('creates the row from the value column too', async () => {
    await render([]);

    type(cells(rows()[0])[1], 'x');

    expect(emitted).toEqual([[{ key: '', value: 'x', enabled: true }]]);
  });

  it('dims the rows that are switched off', async () => {
    await render([{ key: 'a', value: '1', enabled: false }]);

    expect(rows()[0].classList).toContain('is-off');
  });
});
