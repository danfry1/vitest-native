import React from "react";
import { vi } from "vitest";

export function createSectionListMock() {
  const SectionList = React.forwardRef((props: any, ref: any) => {
    const {
      sections,
      renderItem,
      renderSectionHeader,
      renderSectionFooter,
      keyExtractor,
      refreshControl,
      ListEmptyComponent,
      ListHeaderComponent,
      ListFooterComponent,
      ItemSeparatorComponent,
      SectionSeparatorComponent,
      ...rest
    } = props;

    const instanceMethods = {
      scrollToEnd: vi.fn(),
      scrollToIndex: vi.fn(),
      scrollToLocation: vi.fn(),
      recordInteraction: vi.fn(),
      flashScrollIndicators: vi.fn(),
      getScrollResponder: vi.fn(() => ({})),
      getNativeScrollRef: vi.fn(),
      getScrollableNode: vi.fn(),
      setNativeProps: vi.fn(),
    };

    React.useImperativeHandle(ref, () => instanceMethods);

    const children: any[] = [];

    if (ListHeaderComponent) {
      children.push(
        React.createElement(
          "SectionList-Header",
          { key: "__header" },
          typeof ListHeaderComponent === "function"
            ? React.createElement(ListHeaderComponent)
            : ListHeaderComponent,
        ),
      );
    }

    if (sections) {
      sections.forEach((section: any, sectionIndex: number) => {
        if (renderSectionHeader) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `header-${sectionIndex}` },
              renderSectionHeader({ section }),
            ),
          );
        }
        if (SectionSeparatorComponent && sectionIndex > 0) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `section-sep-${sectionIndex}` },
              typeof SectionSeparatorComponent === "function"
                ? React.createElement(SectionSeparatorComponent)
                : SectionSeparatorComponent,
            ),
          );
        }
        if (section.data) {
          section.data.forEach((item: any, index: number) => {
            const key = keyExtractor ? keyExtractor(item, index) : `${sectionIndex}-${index}`;
            children.push(
              React.createElement(
                React.Fragment,
                { key },
                renderItem({
                  item,
                  index,
                  section,
                  separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() },
                }),
              ),
            );
            if (ItemSeparatorComponent && index < section.data.length - 1) {
              children.push(
                React.createElement(
                  React.Fragment,
                  { key: `sep-${sectionIndex}-${index}` },
                  typeof ItemSeparatorComponent === "function"
                    ? React.createElement(ItemSeparatorComponent)
                    : ItemSeparatorComponent,
                ),
              );
            }
          });
        }
        if (renderSectionFooter) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `footer-${sectionIndex}` },
              renderSectionFooter({ section }),
            ),
          );
        }
      });
    }

    if (ListFooterComponent) {
      children.push(
        React.createElement(
          "SectionList-Footer",
          { key: "__footer" },
          typeof ListFooterComponent === "function"
            ? React.createElement(ListFooterComponent)
            : ListFooterComponent,
        ),
      );
    }

    if (refreshControl) {
      children.unshift(refreshControl);
    }

    if ((!sections || sections.length === 0) && ListEmptyComponent) {
      children.push(
        React.createElement(
          "SectionList-Empty",
          { key: "__empty" },
          typeof ListEmptyComponent === "function"
            ? React.createElement(ListEmptyComponent)
            : ListEmptyComponent,
        ),
      );
    }

    return React.createElement("SectionList", { ...rest, ref }, ...children);
  });
  SectionList.displayName = "SectionList";
  return SectionList;
}
