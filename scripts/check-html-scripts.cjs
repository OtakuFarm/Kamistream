// Validate every <script> block in an HTML file for JS syntax errors.
const fs = require('fs');
const h = fs.readFileSync(process.argv[2], 'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(h))) {
  i++;
  const src = m[1].trim();
  if (!src) continue;
  try { new Function(src); }
  catch (e) { bad++; console.log('Block #' + i + ' ERROR: ' + e.message); }
}
console.log(process.argv[2] + ' -> blocks: ' + i + ', syntax errors: ' + bad);
process.exit(bad ? 1 : 0);
