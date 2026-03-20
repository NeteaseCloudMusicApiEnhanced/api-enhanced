import path from 'path';
import { expect, test } from "bun:test";
import { loadModules } from '~/util/loadModules';


test('Next.js-like API Route Loader', () => {
  const modulesDir = path.join(__dirname, '../module/');
  expect(modulesDir).toBe("D:\\Study\\Web\\momo-music-player\\backend\\api-enhanced\\module");
  loadModules(modulesDir);
});
