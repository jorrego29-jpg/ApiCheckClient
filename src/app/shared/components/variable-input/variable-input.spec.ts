import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EnvironmentStore } from '../../../core/state/environment.store';
import { VariableInput } from './variable-input';

describe('VariableInput', () => {
  let fixture: ComponentFixture<VariableInput>;
  const variables = signal<Record<string, string>>({});

  const element = () => fixture.nativeElement as HTMLElement;
  const field = () => element().querySelector<HTMLInputElement>('input')!;
  const marks = () => Array.from(element().querySelectorAll<HTMLElement>('.mirror mark.var'));

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    variables.set({});
    await TestBed.configureTestingModule({
      imports: [VariableInput],
      // Solo se usan las variables del entorno: no hace falta el store entero ni la red.
      providers: [{ provide: EnvironmentStore, useValue: { variables } }],
    }).compileComponents();
    fixture = TestBed.createComponent(VariableInput);
  });

  it('shows the value in the field', async () => {
    await render({ value: 'https://api.test', label: 'URL', dataField: 'value' });

    expect(field().value).toBe('https://api.test');
    expect(field().getAttribute('aria-label')).toBe('URL');
    expect(field().getAttribute('data-field')).toBe('value');
  });

  it('marks the variables that have a value apart from the ones that do not', async () => {
    variables.set({ host: 'api.test' });

    await render({ value: '{{host}}/users/{{id}}' });

    expect(marks().map((mark) => mark.textContent)).toEqual(['{{host}}', '{{id}}']);
    expect(marks().map((mark) => mark.classList.contains('is-missing'))).toEqual([false, true]);
  });

  it('keeps the copy behind the field identical to the text', async () => {
    variables.set({ host: 'h' });
    const text = ' GET {{host}} /x/{{ id }} fin ';

    await render({ value: text });

    expect(element().querySelector('.mirror .text')?.textContent).toBe(text);
  });

  it('follows the environment when its variables change', async () => {
    await render({ value: '{{host}}' });
    expect(marks()[0].classList.contains('is-missing')).toBe(true);

    variables.set({ host: 'api.test' });
    await fixture.whenStable();

    expect(marks()[0].classList.contains('is-missing')).toBe(false);
  });

  it('tells on hover what each variable equals', async () => {
    variables.set({ host: 'api.test' });

    await render({ value: '{{host}} {{id}}' });

    expect(field().title).toBe('{{host}} → api.test\n{{id}} sin definir');
  });

  it('has no hover text nor marks when the text has no variables', async () => {
    await render({ value: 'https://api.test' });

    expect(field().hasAttribute('title')).toBe(false);
    expect(marks()).toHaveLength(0);
  });

  it('draws no copy when it is told not to highlight, or when the text is hidden', async () => {
    await render({ value: '{{host}}', highlight: false });
    expect(element().querySelector('.mirror')).toBeNull();

    await render({ highlight: true, type: 'password' });
    expect(element().querySelector('.mirror')).toBeNull();
    expect(field().type).toBe('password');
  });

  it('reports what is typed', async () => {
    const typed: string[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => typed.push(value));
    await render({ value: '' });

    field().value = 'hola {{x}}';
    field().dispatchEvent(new Event('input'));

    expect(typed).toEqual(['hola {{x}}']);
  });

  it('announces Enter', async () => {
    let pressed = 0;
    fixture.componentInstance.enter.subscribe(() => pressed++);
    await render({ value: 'x' });

    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(pressed).toBe(1);
  });

  it('can take the focus', async () => {
    await render({ value: 'x' });

    fixture.componentInstance.focus();

    expect(document.activeElement).toBe(field());
  });
});
