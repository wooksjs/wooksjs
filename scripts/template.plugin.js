import path from 'node:path';
import fs from 'node:fs/promises';

export function templatePlugin() {
  return {
    name: 'template-html',

    async resolveId(source, importer, options) {
      if (source.endsWith('.tl.html') || source.endsWith('.tl.svg')) {
        // Resolve the full path for the .tl.html file
        const resolvedPath = importer
          ? path.resolve(path.dirname(importer), source)
          : path.resolve(source); // Fallback for entry points

        return { id: resolvedPath, external: false };
      }
      return null; // Let other plugins handle it
    },

    
    async load(id) {
      if (id.endsWith('.tl.html') || id.endsWith('.tl.svg')) {
        const content = await fs.readFile(id, 'utf-8');

        // Regex to find all ${...} expressions
        const templateExpressionRegex = /\${(.*?)}/g;
        let match;
        const topLevelVars = new Set();

        // Iterate through all matches to find potential top-level variables
        while ((match = templateExpressionRegex.exec(content)) !== null) {
          const expression = match[1].trim();
          // This regex aims to capture simple identifiers at the start of an expression.
          // E.g., for "value" it gets "value"
          // For "data.item1" it gets "data"
          // For "func()" it gets "func"
          const topLevelVarMatch = expression.match(/^([a-zA-Z_$][0-9a-zA-Z_$]*)/);
          if (topLevelVarMatch) {
            topLevelVars.add(topLevelVarMatch[1]);
          }
        }

        const varList = Array.from(topLevelVars);
        let destructuringAssignment = '';
        if (varList.length > 0) {
          destructuringAssignment = `const { ${varList.join(', ')} } = ctx;`;
        }

        // The template content itself remains unchanged, as destructuring will
        // make the variables directly available in scope.
        // We ensure no strict mode issues by avoiding `with`.
        return `export default function(ctx) {
  ${destructuringAssignment}
  return \`${content}\`
};`;
      }
      return null;
    }
  };
}