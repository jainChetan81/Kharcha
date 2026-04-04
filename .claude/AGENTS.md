# React Native Rules

Rules for AI agents maintaining this React Native codebase. Prioritized by impact.

---

## 1. Core Rendering — CRITICAL

### 1.1 Never Use && with Potentially Falsy Values

Never use `{value && <Component />}` when `value` could be `""` or `0`. These are falsy but JSX-renderable — React Native crashes in production.

```tsx
// Bad: crashes if count is 0
{count && <Text>{count} items</Text>}

// Good: ternary
{count ? <Text>{count} items</Text> : null}

// Good: explicit boolean
{!!count && <Text>{count} items</Text>}
```

### 1.2 Wrap Strings in Text Components

Strings must be inside `<Text>`. A string as a direct child of `<View>` crashes.

```tsx
// Bad
<View>Hello</View>

// Good
<View><Text>Hello</Text></View>
```

---

## 2. List Performance — HIGH

### 2.1 Use a List Virtualizer

Use FlashList instead of ScrollView with `.map()` — even for short lists.

```tsx
// Bad: renders all items at once
<ScrollView>
  {items.map(item => <ItemCard key={item.id} item={item} />)}
</ScrollView>

// Good: only renders visible items
<FlashList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  estimatedItemSize={80}
/>
```

### 2.2 Avoid Inline Objects in renderItem

Inline objects create new references every render, breaking memoization.

```tsx
// Bad: new object every render
renderItem={({ item }) => (
  <Row style={{ backgroundColor: item.active ? 'green' : 'gray' }} />
)}

// Good: pass primitives, derive inside child
renderItem={({ item }) => (
  <Row id={item.id} name={item.name} isActive={item.active} />
)}
```

### 2.3 Keep List Items Lightweight

No queries, no data fetching, minimal hooks inside list items. Move data fetching to parent.

```tsx
// Bad: query inside list item
function ProductRow({ id }) {
  const { data } = useQuery(['product', id], () => fetchProduct(id))
  // ...
}

// Good: parent fetches, passes primitives
function ProductRow({ name, price }: Props) {
  return <View><Text>{name}</Text><Text>{price}</Text></View>
}
```

### 2.4 Stable Object References

Don't `.map()` or `.filter()` data before passing to virtualized lists — it creates new references on every render.

```tsx
// Bad: new objects every render
const domains = tlds.map(tld => ({ domain: `${keyword}.${tld.name}` }))
<FlashList data={domains} />

// Good: pass stable data, transform inside items
<FlashList data={tlds} renderItem={({ item }) => <DomainItem tld={item} />} />
```

### 2.5 Pass Primitives for Memoization

Primitive props enable shallow comparison in `memo()`.

```tsx
// Bad: object prop
<UserRow user={item} />

// Good: primitive props
<UserRow id={item.id} name={item.name} />
```

---

## 3. Animation — HIGH

### 3.1 Animate Transform and Opacity, Not Layout

Avoid animating `width`, `height`, `top`, `left`, `margin`, `padding` — these trigger layout recalculation every frame. Use `transform` and `opacity` (GPU-accelerated).

```tsx
// Bad: layout recalculation every frame
useAnimatedStyle(() => ({ height: withTiming(expanded ? 200 : 0) }))

// Good: GPU-accelerated
useAnimatedStyle(() => ({
  transform: [{ scaleY: withTiming(expanded ? 1 : 0) }],
  opacity: withTiming(expanded ? 1 : 0),
}))
```

### 3.2 Prefer useDerivedValue Over useAnimatedReaction

Use `useDerivedValue` for deriving values. Reserve `useAnimatedReaction` for side effects only.

```tsx
// Bad
useAnimatedReaction(() => progress.value, (current) => { opacity.value = 1 - current })

// Good
const opacity = useDerivedValue(() => 1 - progress.get())
```

---

## 4. Scroll Performance — HIGH

### 4.1 Never Track Scroll Position in useState

Scroll events fire rapidly — `useState` causes render thrashing. Use Reanimated shared values or refs.

```tsx
// Bad: re-renders every frame
const [scrollY, setScrollY] = useState(0)
const onScroll = (e) => setScrollY(e.nativeEvent.contentOffset.y)

// Good: UI thread, no re-render
const scrollY = useSharedValue(0)
const onScroll = useAnimatedScrollHandler({
  onScroll: (e) => { scrollY.value = e.contentOffset.y },
})
```

---

## 5. React State — MEDIUM

### 5.1 Minimize State, Derive Values

If a value can be computed from existing state or props, derive it — don't store it.

```tsx
// Bad: redundant state
const [total, setTotal] = useState(0)
useEffect(() => setTotal(items.reduce((s, i) => s + i.price, 0)), [items])

// Good: derived
const total = items.reduce((s, i) => s + i.price, 0)
```

### 5.2 State Must Represent Ground Truth

Store state (e.g., `pressed`), derive visuals (e.g., `scale`).

```tsx
// Bad: storing visual
const scale = useSharedValue(1)
tap.onBegin(() => { scale.set(withTiming(0.95)) })

// Good: storing state, deriving visual
const pressed = useSharedValue(0)
tap.onBegin(() => { pressed.set(withTiming(1)) })
const style = useAnimatedStyle(() => ({
  transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.95]) }],
}))
```

### 5.3 Use Dispatch Updaters for State That Depends on Current Value

```tsx
// Bad: stale closure
const onLayout = () => setSize({ width, height })

// Good: dispatch updater
const onLayout = () => setSize(prev => {
  if (prev?.width === width && prev?.height === height) return prev
  return { width, height }
})
```

---

## 6. React Compiler — MEDIUM

### 6.1 Destructure Functions Early

Destructured functions are stable references; dotting creates new references.

```tsx
// Bad
const router = useRouter()
const handlePress = () => { router.push('/success') }

// Good
const { push } = useRouter()
const handlePress = () => { push('/success') }
```

### 6.2 Use .get() and .set() for Reanimated Shared Values

`.value` access opts out of React Compiler.

```tsx
// Bad
count.value = count.value + 1

// Good
count.set(count.get() + 1)
```

---

## 7. User Interface — MEDIUM

### 7.1 Use Pressable Instead of Touchable

Always use `Pressable` instead of `TouchableOpacity`, `TouchableHighlight`, etc.

```tsx
// Bad
<TouchableOpacity onPress={onPress}><Text>Tap</Text></TouchableOpacity>

// Good
<Pressable onPress={onPress}><Text>Tap</Text></Pressable>
```

### 7.2 Use Native Navigators

Use `@react-navigation/native-stack` or expo-router's default stack. Avoid `@react-navigation/stack` (JS-based).

---

## 8. Monorepo — LOW

### 8.1 Install Native Dependencies in App Directory

Autolinking only scans the app's `node_modules`. Native deps in shared packages won't be linked.

```
// Bad: native dep only in shared package
packages/ui/package.json     # has react-native-reanimated
packages/app/package.json    # missing it — autolinking fails

// Good: also in app
packages/app/package.json    # has react-native-reanimated
```

### 8.2 Use Single Dependency Versions Across Monorepo

Use exact versions. Multiple versions cause duplicate bundles and runtime conflicts.

```json
// Root package.json
{
  "pnpm": {
    "overrides": {
      "react-native-reanimated": "3.16.1"
    }
  }
}
```

---

## 9. JavaScript — LOW

### 9.1 Hoist Intl Formatter Creation

`Intl.*` constructors are expensive. Hoist to module scope.

```tsx
// Bad: new formatter every render
function Price({ amount }) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
  return <Text>{fmt.format(amount)}</Text>
}

// Good: module scope
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
function Price({ amount }) {
  return <Text>{fmt.format(amount)}</Text>
}
```
