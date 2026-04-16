import * as Haptics from "expo-haptics";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import {
  useAddBank,
  useAddBankEmail,
  useBanksWithEmails,
  useDeleteBank,
  useDeleteBankEmail,
  useSetBankActive,
} from "@/hooks/use-banks";
import { showDeleteConfirm } from "@/lib/alerts";
import { COLORS } from "@/lib/constants";
import type { BankWithEmails } from "@/lib/db/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

export default function BanksScreen() {
  const { data: banks = [], isLoading } = useBanksWithEmails();
  const addBank = useAddBank();
  const setActive = useSetBankActive();
  const addEmail = useAddBankEmail();
  const deleteEmail = useDeleteBankEmail();
  const deleteBank = useDeleteBank();

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [emailDrafts, setEmailDrafts] = useState<Record<number, string>>({});
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [newBankName, setNewBankName] = useState("");
  const [newBankEmail, setNewBankEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);

  const isValidEmail = (e: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  function toggleExpand(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleToggleActive(bank: BankWithEmails) {
    Haptics.selectionAsync();
    try {
      await setActive.mutateAsync({
        id: bank.id,
        active: bank.is_active !== 1,
      });
    } catch (err) {
      showErrorToast("Failed to update bank", err);
    }
  }

  async function handleAddEmail(bankId: number) {
    if (addingEmail) return;
    setAddingEmail(true);
    try {
      const email = (emailDrafts[bankId] ?? "").trim();
      if (!isValidEmail(email)) {
        showErrorToast("Invalid email", "Please enter a valid email address");
        return;
      }
      if (
        banks.some((b) =>
          b.emails.some((x) => x.email.toLowerCase() === email.toLowerCase()),
        )
      ) {
        showErrorToast("Duplicate email", `${email} is already used`);
        return;
      }
      await addEmail.mutateAsync({ bankId, email });
      setEmailDrafts((d) => ({ ...d, [bankId]: "" }));
      showSuccessToast("Email added");
    } catch (err) {
      showErrorToast("Failed to add email", err);
    } finally {
      setAddingEmail(false);
    }
  }

  function handleDeleteEmail(emailId: number, email: string) {
    showDeleteConfirm("Delete email?", email, async () => {
      try {
        await deleteEmail.mutateAsync(emailId);
      } catch (err) {
        showErrorToast("Failed to delete email", err);
      }
    });
  }

  function handleDeleteBank(id: number, name: string) {
    showDeleteConfirm(
      "Delete bank?",
      `${name} and all its emails will be removed.`,
      async () => {
        try {
          await deleteBank.mutateAsync(id);
        } catch (err) {
          showErrorToast("Failed to delete bank", err);
        }
      },
    );
  }

  async function handleAddBank() {
    const name = newBankName.trim();
    const email = newBankEmail.trim();
    if (!name) return;
    if (!isValidEmail(email)) {
      showErrorToast("Invalid email", "Please enter a valid email address");
      return;
    }
    if (banks.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      showErrorToast("Duplicate bank", `${name} already exists`);
      return;
    }
    if (
      banks.some((b) =>
        b.emails.some((e) => e.email.toLowerCase() === email.toLowerCase()),
      )
    ) {
      showErrorToast("Duplicate email", `${email} is already used`);
      return;
    }
    try {
      await addBank.mutateAsync({ name, email, parserKey: null });
      setNewBankName("");
      setNewBankEmail("");
      setShowAddSheet(false);
      showSuccessToast("Bank added");
    } catch (err) {
      showErrorToast("Failed to add bank", err);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Banks" />

      <KeyboardAvoidingView
        behavior={isIOS ? "padding" : undefined}
        className="flex-1"
        keyboardVerticalOffset={80}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
        >
          <Text className="mx-5 mb-3 text-xs text-muted-foreground">
            Only keep the banks you actually use as active.
          </Text>

          {isLoading ? (
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              Loading…
            </Text>
          ) : banks.length === 0 ? (
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              No banks yet
            </Text>
          ) : (
            banks.map((bank) => {
              const isExpanded = expanded.has(bank.id);
              const isActive = bank.is_active === 1;
              return (
                <View
                  key={bank.id}
                  className={cn(
                    "mx-5 mb-2 rounded-xl border border-border bg-card",
                    !isActive && "opacity-50",
                  )}
                >
                  <View className="flex-row items-center px-4 py-3">
                    <Pressable
                      onPress={() => toggleExpand(bank.id)}
                      className="flex-1 flex-row items-center"
                    >
                      <Text className="flex-1 text-sm font-medium text-foreground">
                        {bank.name}
                      </Text>
                      <View className="mr-3 rounded-full bg-muted px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-muted-foreground">
                          {bank.emails.length}
                        </Text>
                      </View>
                      <Icon
                        as={isExpanded ? ChevronUp : ChevronDown}
                        className="mr-2 size-4 text-muted-foreground"
                      />
                    </Pressable>
                    <Switch
                      value={isActive}
                      onValueChange={() => handleToggleActive(bank)}
                      trackColor={{
                        false: COLORS.BAR_BG,
                        true: COLORS.PRIMARY,
                      }}
                      thumbColor={COLORS.FOREGROUND}
                      style={{ marginLeft: 8 }} // Native component — className not supported
                    />
                  </View>

                  {isExpanded && (
                    <View className="border-t border-border px-4 py-3">
                      {bank.emails.map((e) => {
                        const canDelete = bank.emails.length > 1;
                        return (
                          <View
                            key={e.id}
                            className="mb-2 flex-row items-center rounded-lg bg-background px-3 py-2.5"
                          >
                            <Text className="flex-1 text-sm text-foreground">
                              {e.email}
                            </Text>
                            <Pressable
                              onPress={() =>
                                canDelete && handleDeleteEmail(e.id, e.email)
                              }
                              disabled={!canDelete}
                              hitSlop={6}
                            >
                              <Icon
                                as={Trash2}
                                className={cn(
                                  "size-4",
                                  canDelete
                                    ? "text-negative"
                                    : "text-muted-foreground/40",
                                )}
                              />
                            </Pressable>
                          </View>
                        );
                      })}

                      <View className="mt-2 flex-row gap-2">
                        <Input
                          placeholder="add email"
                          placeholderTextColor={COLORS.MUTED}
                          value={emailDrafts[bank.id] ?? ""}
                          onChangeText={(v) =>
                            setEmailDrafts((d) => ({ ...d, [bank.id]: v }))
                          }
                          autoCapitalize="none"
                          keyboardType="email-address"
                          className="flex-1"
                        />
                        <Button
                          className="h-10 rounded-xl bg-primary px-3"
                          onPress={() => handleAddEmail(bank.id)}
                          disabled={
                            !isValidEmail(emailDrafts[bank.id] ?? "") ||
                            addingEmail
                          }
                        >
                          <Icon as={Plus} className="size-4 text-white" />
                        </Button>
                      </View>

                      {bank.is_default !== 1 && (
                        <Pressable
                          onPress={() => handleDeleteBank(bank.id, bank.name)}
                          className="mt-3 flex-row items-center justify-center py-2"
                        >
                          <Icon
                            as={Trash2}
                            className="mr-2 size-4 text-negative"
                          />
                          <Text className="text-xs font-medium text-negative">
                            Delete bank
                          </Text>
                        </Pressable>
                      )}
                      {bank.is_default === 1 && (
                        <View className="mt-3 flex-row items-center justify-center py-1">
                          <Icon
                            as={Lock}
                            className="mr-2 size-3 text-muted-foreground"
                          />
                          <Text className="text-[10px] text-muted-foreground">
                            default bank
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View className="mx-5 mt-6">
            <Button
              className="h-12 rounded-xl bg-primary"
              onPress={() => setShowAddSheet(true)}
            >
              <Icon as={Plus} className="mr-2 size-4 text-white" />
              <Text className="text-sm font-semibold text-primary-foreground">
                Add Bank
              </Text>
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        avoidKeyboard
      >
        <Text className="mb-4 text-base font-bold text-foreground">
          Add Bank
        </Text>
        <Input
          placeholder="Bank name"
          placeholderTextColor={COLORS.MUTED}
          value={newBankName}
          onChangeText={setNewBankName}
          className="mb-3"
        />
        <Input
          placeholder="alerts@bank.com"
          placeholderTextColor={COLORS.MUTED}
          value={newBankEmail}
          onChangeText={setNewBankEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          className="mb-4"
        />
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-xl border-border"
            onPress={() => setShowAddSheet(false)}
          >
            <Text className="text-sm font-medium text-muted-foreground">
              Cancel
            </Text>
          </Button>
          <Button
            className="h-12 flex-1 rounded-xl bg-primary"
            onPress={handleAddBank}
            disabled={!newBankName.trim() || !isValidEmail(newBankEmail)}
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              Save
            </Text>
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}

export const ErrorBoundary = ScreenError;
