// Imports two modules that each import "dup", resolved to different copies.
import { top } from "./dup-top";
import { nested } from "./nested/dup-nested";
export const both = [top, nested];
