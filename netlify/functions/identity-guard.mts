// Accounts are created only by an administrator (see admin-users.mts),
// so every public self-signup attempt is rejected.
export default {
  userValidate(event: { deny: () => unknown }) {
    return event.deny();
  },
};
