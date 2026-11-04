import { fetchUser } from "./api";
import { fetchUser as assignable } from "./api-assign";
export const callSpied = () => fetchUser();
export const callAssigned = () => assignable();
