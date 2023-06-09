import { defineBuildConfig } from 'unbuild';

import { Sea } from '../src/index';

export default defineBuildConfig({
  entries: ['./src/hello'],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true
  },
  preset: Sea()
});
