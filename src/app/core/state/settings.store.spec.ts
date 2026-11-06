import { TestBed } from '@angular/core/testing';
import { IGNORE_SSL_KEY, SettingsStore } from './settings.store';

describe('SettingsStore', () => {
  afterEach(() => localStorage.clear());

  it('verifies SSL until told otherwise', () => {
    expect(TestBed.inject(SettingsStore).ignoreSsl()).toBe(false);
  });

  it('remembers ignoreSsl across reloads', () => {
    TestBed.inject(SettingsStore).setIgnoreSsl(true);
    expect(localStorage.getItem(IGNORE_SSL_KEY)).toBe('true');

    TestBed.resetTestingModule();
    expect(TestBed.inject(SettingsStore).ignoreSsl()).toBe(true);
  });

  it('forgets it once turned off', () => {
    const store = TestBed.inject(SettingsStore);
    store.setIgnoreSsl(true);
    store.setIgnoreSsl(false);

    expect(store.ignoreSsl()).toBe(false);
    expect(localStorage.getItem(IGNORE_SSL_KEY)).toBeNull();
  });
});
