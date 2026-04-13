import SwiftUI
import WidgetKit

// MARK: - Colors

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        scanner.scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

private let bgColor = Color(hex: "#0a0a0a")
private let fgColor = Color(hex: "#f0f0f0")
private let mutedColor = Color(hex: "#888888")
private let primaryColor = Color(hex: "#7c3aed")
private let barBgColor = Color(hex: "#2a2a2a")
private let dangerColor = Color(hex: "#ef4444")
private let positiveColor = Color(hex: "#22c55e")

private let categoryPalette: [Color] = [
    Color(hex: "#7c3aed"), // purple
    Color(hex: "#f59e0b"), // amber
    Color(hex: "#22c55e"), // green
    Color(hex: "#3b82f6"), // blue
    Color(hex: "#ef4444"), // red
    Color(hex: "#ec4899"), // pink
    Color(hex: "#06b6d4"), // cyan
]

// MARK: - Data Model

struct WidgetCategory: Codable {
    let name: String
    let amount: Double
    let percentage: Double
}

struct WidgetData: Codable {
    let totalExpenses: Double
    let currencySymbol: String
    let monthLabel: String
    let categories: [WidgetCategory]
    let projectedLow: Double?
    let projectedHigh: Double?
    let daysElapsed: Int
    let daysInMonth: Int
    let todaySpend: Double
    let totalBudget: Double?
    let previousMonthSpendAtThisPoint: Double?
    let lastUpdated: String
}

struct SpendEntry: TimelineEntry {
    let date: Date
    let data: WidgetData?
}

// MARK: - Formatting

private func formatAmount(_ amount: Double, symbol: String) -> String {
    if amount >= 100_000 {
        return "\(symbol)\(String(format: "%.1f", amount / 100_000))L"
    }
    if amount >= 1_000 {
        let k = amount / 1_000
        if k == k.rounded() {
            return "\(symbol)\(Int(k))k"
        }
        return "\(symbol)\(String(format: "%.1f", k))k"
    }
    return "\(symbol)\(Int(amount))"
}

// MARK: - Timeline Provider

struct SpendProvider: TimelineProvider {
    private let appGroup = "group.com.chetanjain.kharcha"

    func placeholder(in context: Context) -> SpendEntry {
        SpendEntry(date: Date(), data: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (SpendEntry) -> Void) {
        completion(SpendEntry(date: Date(), data: loadData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SpendEntry>) -> Void) {
        let entry = SpendEntry(date: Date(), data: loadData())
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func loadData() -> WidgetData? {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let json = defaults.string(forKey: "widgetData"),
              let data = json.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetData.self, from: data)
    }
}

// MARK: - Empty State

struct PlaceholderView: View {
    var body: some View {
        VStack(spacing: 4) {
            Text("kharcha")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(primaryColor)
            Text("Open app to\nget started")
                .font(.system(size: 11))
                .foregroundColor(mutedColor)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Small Widget

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(data.monthLabel)
                .font(.system(size: 11))
                .foregroundColor(mutedColor)

            Spacer()

            VStack(alignment: .leading, spacing: 2) {
                Text(formatAmount(data.totalExpenses, symbol: data.currencySymbol))
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(fgColor)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)

                Text("this month")
                    .font(.system(size: 11))
                    .foregroundColor(mutedColor)
            }

            Spacer()

            HStack {
                Text("today")
                    .font(.system(size: 11))
                    .foregroundColor(mutedColor)
                Spacer()
                Text(formatAmount(data.todaySpend, symbol: data.currencySymbol))
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor(fgColor)
            }
        }
        .padding(14)
    }
}

// MARK: - Category Bar

struct CategoryBar: View {
    let name: String
    let amount: Double
    let percentage: Double
    let symbol: String
    var barColor: Color = primaryColor

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(name)
                    .font(.system(size: 10))
                    .foregroundColor(mutedColor)
                    .lineLimit(1)
                Spacer()
                Text(formatAmount(amount, symbol: symbol))
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundColor(fgColor)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(barBgColor)
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(barColor)
                        .frame(width: geo.size.width * min(percentage / 100, 1.0), height: 4)
                }
            }
            .frame(height: 4)
        }
    }
}

// MARK: - Medium Widget

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 16) {
            // Left: totals
            VStack(alignment: .leading, spacing: 0) {
                Text(data.monthLabel)
                    .font(.system(size: 11))
                    .foregroundColor(mutedColor)

                Spacer()

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(formatAmount(data.totalExpenses, symbol: data.currencySymbol))
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(fgColor)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)

                    if let prev = data.previousMonthSpendAtThisPoint, prev > 0 {
                        let isUp = data.totalExpenses > prev
                        Image(systemName: isUp ? "arrow.up.right" : "arrow.down.right")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(isUp ? dangerColor : positiveColor)
                    }
                }

                Spacer()

                HStack(spacing: 4) {
                    Text("today:")
                        .font(.system(size: 10))
                        .foregroundColor(mutedColor)
                    Text(formatAmount(data.todaySpend, symbol: data.currencySymbol))
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundColor(fgColor)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Right: top 3 categories
            VStack(spacing: 6) {
                ForEach(Array(data.categories.prefix(3).enumerated()), id: \.offset) { index, cat in
                    CategoryBar(
                        name: cat.name,
                        amount: cat.amount,
                        percentage: cat.percentage,
                        symbol: data.currencySymbol,
                        barColor: categoryPalette[index % categoryPalette.count]
                    )
                }
                Spacer()
                if let low = data.projectedLow, let high = data.projectedHigh {
                    Text("proj: \(formatAmount(low, symbol: data.currencySymbol))–\(formatAmount(high, symbol: data.currencySymbol))")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundColor(fgColor.opacity(0.7))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
    }
}

// MARK: - Widget Entry View

struct KharchaWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: SpendEntry

    var body: some View {
        Group {
            if let data = entry.data {
                switch family {
                case .systemSmall:
                    SmallWidgetView(data: data)
                case .systemMedium:
                    MediumWidgetView(data: data)
                default:
                    SmallWidgetView(data: data)
                }
            } else {
                PlaceholderView()
            }
        }
        .widgetURL(URL(string: "kharcha:///"))
    }
}

// MARK: - Widget Configuration

@main
struct KharchaWidget: Widget {
    let kind = "KharchaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SpendProvider()) { entry in
            KharchaWidgetEntryView(entry: entry)
                .containerBackground(bgColor, for: .widget)
        }
        .configurationDisplayName("Kharcha Spending")
        .description("See your spending at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
