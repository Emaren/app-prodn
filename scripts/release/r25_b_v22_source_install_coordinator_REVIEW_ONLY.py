#!/usr/bin/env python3
"""Session B root-executor sequencing: injectable, REVIEW ONLY, no CLI.

This invokes the qualified PR1330 transaction primitive via a host adapter,
with an on-disk systemd ConditionPathExists negative fence BEFORE the first
source swap. A real adapter/immutable root wrapper/independent Central permit
must be separately reviewed and installed. Not a self-authorizing installer.
"""
from __future__ import annotations

from contextlib import contextmanager
import sys

class Hold(RuntimeError):
    pass

class SourceInstallCoordinator:
    def __init__(self, backend, transaction, admission):
        self.backend = backend
        self.tx = transaction
        self.admission = admission
        self.phase = "UNSTARTED"

    def install(self):
        """No production method exposed by CLI. Fail shut on any exception."""
        if not self.admission.get("source_install_only", False):
            raise Hold("NO_INDEPENDENT_SOURCE_INSTALL_AUTHORIZATION")
        if self.admission.get("public_activation", True) or self.admission.get("financial_authority", True):
            raise Hold("AUTHORIZATION_SCOPE_WIDENED")
        self.backend.require_immutable_root_executor()
        self.backend.validate_root_packet_and_independent_central()
        self.backend.verify_seven_pid_c04_finance_original_preflight()
        self.phase = "AUTHORITY_CHECKED_NO_MUTATION"
        with self.backend.held_original_v22_flock():
            self.backend.require_steam_oneshot_quiescent()
            self.backend.verify_root_v20_inverse()
            self.backend.install_exact_persistent_condition_guard()
            self.backend.daemon_reload_and_prove_negative_condition()
            self.phase = "PERSISTENT_GUARD_INSTALLED"
            # AFTER a crash, boot systemd reads ConditionPathExists=!SENTINEL.
            # No V22 one-shot can run while marker remains even if timer is enabled.
            self.backend.create_root_only_install_sentinel()
            self.phase = "PERSISTENT_SENTINEL_ACTIVE"
            self.backend.stop_only_existing_steam_timer()
            self.backend.require_steam_oneshot_quiescent()
            try:
                self.tx.prepare()  # original V22 inverse + two original-ABSENT markers
                self.phase = "PREPARED"
                self.tx.apply()    # each replacement atomic+fsynced
                self.phase = "SWAPPED_PENDING_NATIVE_PROOF"
                self.backend.native_new_v22_selftest_and_original_profile()
                self.backend.verify_seven_pid_c04_finance_original_postflight()
                self.backend.seal_source_install_receipt_no_activation()
                self.phase = "SOURCE_INSTALL_RECEIPT_SEALED"
            except Exception as source_error:
                # Never un-fence merely because the Python process catches an
                # exception. An independently approved root recovery adapter
                # can inverse exact OLD/NEW source hashes after the crash.
                self.phase = "HOLD_FENCED_RECOVERY_REQUIRED"
                raise Hold("FENCED_SOURCE_INSTALL_RECOVERY_REQUIRED") from source_error
            # The source set is now all NEW and V22 original profile accepted.
            # Removing fence without all above proofs would be a bypass.
            self.backend.remove_exact_sentinel()
            self.phase = "SOURCE_CONSISTENT_UNFENCED"
            self.backend.remove_own_exact_condition_guard()
            self.backend.daemon_reload_restore_original_effective_unit()
            self.backend.restore_original_steam_timer()
            self.backend.verify_original_seven_pid_and_steam_refresh()
            self.phase = "SOURCE_INSTALL_COMPLETE_NO_ACTIVATION"
        return {"status": "PASS_SOURCE_INSTALL_SEQUENCED_HOST_ADAPTER",
                "phase": self.phase, "public_cutover": False,
                "financial_authority": False}

    def recover_original(self):
        """Existing transaction receipt only; never creates new install approval."""
        self.backend.require_root_recovery_executor()
        with self.backend.held_original_v22_flock():
            self.backend.require_persistent_guard_and_sentinel()
            # On reboot an ENABLED timer may resume; the persisted condition
            # denies service execution, then the inverse re-quiesces timer.
            self.backend.stop_only_existing_steam_timer()
            self.backend.require_steam_oneshot_quiescent()
            self.backend.verify_existing_root_transaction_receipt()
            # Separate source transaction has precise known-old/known-new bytes.
            if self.backend.transaction_has_complete_inverse():
                self.tx.inverse()
            else:
                # Crash in PREPARE: no swap was permitted without PREPARED
                # and all original SHA values must still match.
                self.backend.verify_no_swap_was_started()
            self.backend.cleanup_exact_abandoned_new_stages()
            self.backend.native_original_v22_selftest_and_v20_fallback()
            self.backend.verify_original_recovery_protected_postflight()
            self.backend.seal_exact_inverse_receipt()
            self.backend.remove_exact_sentinel()
            self.backend.remove_own_exact_condition_guard()
            self.backend.daemon_reload_restore_original_effective_unit()
            self.backend.restore_original_steam_timer()
            self.backend.verify_original_seven_pid_and_steam_refresh()
        return {"status": "PASS_EXACT_OLD_SOURCE_INVERSE_AFTER_EXTERNAL_PROOF",
                "public_cutover": False, "financial_authority": False}

if __name__ == "__main__":
    print("HOLD:REVIEW_ONLY_NO_INSTALL_OR_RECOVER_CLI")
    sys.exit(3)
