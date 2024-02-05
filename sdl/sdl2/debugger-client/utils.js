export function displayHex(val, size) {
  if (val === undefined) {
    return;
  }

  let slice = 0;
  if (size === "w") {
    slice = -4;
  }

  val = val < 0 ? 0x100000000 + val : val;
  return "$" + val.toString(16).toUpperCase().slice(slice);
}
