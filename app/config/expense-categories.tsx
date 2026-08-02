import { CategoryListScreen } from "@/components/category-list-screen";
import { ScreenError } from "@/components/error-boundary";
import { TRANSACTION_TYPE } from "@/lib/constants";

export default function ExpenseCategoriesScreen() {
  return <CategoryListScreen type={TRANSACTION_TYPE.EXPENSE} />;
}

export const ErrorBoundary = ScreenError;
