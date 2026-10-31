/** An entry of PickList: what it sets, its name, a line about it and its source. */
export interface PickOption {
  value: string;
  label: string;
  line?: string;
  source?: string;
}
