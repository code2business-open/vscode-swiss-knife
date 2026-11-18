/**
{
  "api": 1,
  "name": "RGB to Hex",
  "description": "Converts three RGB integer channels to an uppercase hexadecimal color.",
  "author": "Code2Business",
  "tags": "rgb,hex,color,convert"
}
**/
function main(state) {
  const value = state.text.trim();
  const wrapped = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i;
  const comma = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/;
  const spaced = /^(\d+)\s+(\d+)\s+(\d+)$/;
  const match = value.match(wrapped) || value.match(comma) || value.match(spaced);
  if (!match || match.slice(1).some(channel => Number(channel) > 255)) {
    state.postError('Expected three RGB integers from 0 to 255, e.g. rgb(255, 0, 128).');
    return;
  }
  state.text = '#' + match.slice(1).map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
}
