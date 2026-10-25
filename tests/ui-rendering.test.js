import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Exercise real JSX render paths, including callbacks evaluated during render.
const directory = mkdtempSync(join(tmpdir(), 'pawcare-render-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const bundle = join(directory, 'ui.cjs');
buildSync({
  stdin: {
    contents: `
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
      export { owner } from './src/roles/Owner.jsx';
      export { admin } from './src/roles/Admin.jsx';
      export { vet } from './src/roles/Vet.jsx';
      export { assistant } from './src/roles/Assistant.jsx';
      export { ProfileBody, PasswordBody } from './src/roles/owner/Profile.jsx';
      export { PetFormModal, PetProfileModal } from './src/roles/owner/Pets.jsx';
      export { default as Reports } from './src/roles/ReportsPage.jsx';
      export { default as ErrorBoundary } from './src/ErrorBoundary.jsx';
      export { SEED } from './src/lib.jsx';
      export { emptyClinicState } from './src/clinicState.js';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  outfile: bundle,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'silent',
});
const ui = createRequire(import.meta.url)(bundle);
const render = (Component, props) => ui.renderToStaticMarkup(ui.createElement(Component, props));
const me = role => ({ id: role === 'vet' ? 'v1' : 'u1', ownerId: 'o1', role, name: 'Sample User', email: 'owner@example.test' });
const populated = () => ({ ...ui.emptyClinicState(), ...structuredClone(ui.SEED), vets: [{ id: 'v1', name: 'Sample Vet' }] });
const props = (role, db) => ({ db, me: me(role), setDb() {}, go() {}, say() {}, onClose() {} });

for (const role of ['owner', 'vet', 'assistant', 'admin']) {
  for (const [state, makeDb] of [['empty', ui.emptyClinicState], ['populated', populated]]) {
    for (const page of ui[role].menu.filter(page => !page.hide)) {
      const Component = page.Page || (page.dash ? ui[role].Dash : page.rep ? ui.Reports : null);
      if (Component) test(`${role} ${page.k} renders with ${state} records`, () => {
        assert.ok(render(Component, props(role, makeDb())).length);
      });
    }
  }
}

test('vaccination cards render administered history without an active booster recall', () => {
  const db = populated();
  db.vacc = [{ id: 'dose', petId: 'p1', vaccine: 'Anti-rabies', done: true, vetId: 'v1', date: '2026-01-01', nextDue: null }];
  const html = render(ui.owner.menu.find(page => page.k === 'vacc').Page, props('owner', db));
  assert.match(html, /Anti-rabies/);
});

for (const role of ['owner', 'vet', 'assistant', 'admin']) {
  test(`${role} profile renders a loaded email address`, () => {
    const db = populated();
    db.accountProfiles = { [me(role).id]: { ...me(role), phone: '09171234567' } };
    assert.match(render(ui.ProfileBody, props(role, db)), /owner@example.test/);
  });
  test(`${role} password settings render`, () => {
    assert.match(render(ui.PasswordBody, props(role, populated())), /Current password/);
  });
}

test('owner pet registration and patient details render', () => {
  const db = populated();
  assert.ok(render(ui.PetFormModal, props('owner', db)).length);
  assert.ok(render(ui.PetProfileModal, { ...props('owner', db), pet: db.pets[0] }).length);
});


test('production recovery explains the next action without exposing exception details', () => {
  const boundary = new ui.ErrorBoundary({ inline: true });
  boundary.state = { hasError: true, error: new Error("Cannot access 'mine' before initialization") };
  const html = ui.renderToStaticMarkup(boundary.render());
  assert.match(html, /Try again/);
  assert.match(html, /Back to dashboard/);
  assert.doesNotMatch(html, /before initialization|Developer details/);
});


test('page recovery can return to the dashboard without reloading the workspace', () => {
  let navigated = false, retried = false;
  const boundary = new ui.ErrorBoundary({ inline: true, onReset: () => { navigated = true; } });
  boundary.retry = () => { retried = true; };
  boundary.goHome();
  assert.equal(navigated, true);
  assert.equal(retried, true);
});

test('root recovery only resets the remembered screen and preserves stored data', () => {
  const oldStorage = globalThis.sessionStorage, oldWindow = globalThis.window;
  const store = new Map([
    ['pawcare_last_session_user', JSON.stringify({ id: 'owner' })],
    ['pawcare_page_owner', 'vacc'], ['pawcare_token', 'synthetic-session'],
    ['unrelated-setting', 'preserve'],
  ]);
  let location;
  globalThis.sessionStorage = { getItem: key => store.get(key), removeItem: key => store.delete(key) };
  globalThis.window = { location: { assign: value => { location = value; } } };
  try {
    new ui.ErrorBoundary({}).goHome();
    assert.equal(location, '/');
    assert.equal(store.has('pawcare_page_owner'), false);
    assert.equal(store.get('pawcare_token'), 'synthetic-session');
    assert.equal(store.get('unrelated-setting'), 'preserve');
  } finally {
    if (oldStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = oldStorage;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});


test('owner dashboard explains a booked vaccine with no booster due date', () => {
  const db = populated();
  db.vacc = [];
  db.appts = [{ id: 'vaccine-visit', petId: 'p1', ownerId: 'o1', service: 'vaccination', reason: 'Vaccination – Anti-rabies', date: '2099-01-05', time: '10:00', status: 'Confirmed' }];
  const html = render(ui.owner.Dash, props('owner', db));
  assert.match(html, /Anti-rabies/);
  assert.match(html, /Visit: 2099-01-05/);
  assert.match(html, /Booster date not recorded/);
});

test('front desk surfaces a future booking before its arrival date', () => {
  const db = populated();
  db.appts = [{id:'future-approval',petId:'p1',vetId:'v1',date:'2099-01-05',time:'10:00',status:'Scheduled',reason:'Future vaccination request',notes:'Please call before the visit.'}];
  const html = render(ui.assistant.Dash, props('assistant', db));
  assert.match(html, /Needs clinic approval/);
  assert.match(html, /Visit requests \(1\)/);
  assert.match(html, /Future vaccination request/);
  assert.match(html, /2099-01-05/);
  assert.match(html, /10:00 AM/);
  assert.match(html, /Sample Vet/);
  assert.match(html, /Please call before the visit/);
  assert.match(html, /Approve visit/);
});
