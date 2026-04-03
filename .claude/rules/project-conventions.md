# Project Conventions - [Kharcha]

## Architecture
- Use feature-based folder structure: `src/features/[feature]/`
- API calls go in `src/features/[feature]/api/`
- Components go in `src/features/[feature]/components/`

## State Management
- Use Zustand for global state
- Use React Query for server state
- Never use Redux for new features

## Styling
- Use NativeWind for styling
- Theme colors: always import from `src/theme/colors.ts`
- Spacing scale: 4px base (1 = 4px, 2 = 8px, etc.)

## Naming Conventions
- Components: PascalCase (e.g., `UserProfile.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useUserData.ts`)
- API functions: camelCase (e.g., `fetchUserProfile.ts`)

## Testing
- Write tests for all API hooks
- Use MSW for mocking API calls

## Performance Rules (Beyond Vercel)
- Images must use `priority` prop if above fold
- Lists must use `estimatedItemSize` with LegendList