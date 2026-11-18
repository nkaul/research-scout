import { expect, type Page } from '@playwright/test';

/** Open the single diagnostic pane without triggering any acquisition. */
export async function openSearchInformation(page: Page, section: 'Search overview' | 'Query and focus' | 'Sources and coverage' | 'Timing and usage' = 'Search overview') {
  const pane = page.getByTestId('search-information');
  const toggle = page.getByTestId('search-information-controls').getByRole('button', { name: section, exact: true });
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return pane;
}

/** Show the local-only result filter and return its search input. */
export async function openResultFilter(page: Page) {
  const trigger = page.getByRole('button', { name: 'Filter available results', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const input = page.getByRole('dialog', { name: 'Filter available results', exact: true }).getByRole('searchbox', { name: 'Find in available search results', exact: true });
  await expect(input).toBeVisible();
  return input;
}

/** Advanced search options are intentionally compact in the default results UI. */
export async function openSearchSettings(page: Page) {
  const settings = page.getByTestId('search-settings');
  if (await settings.count() && await settings.isVisible() && !await settings.evaluate(node => node.hasAttribute('open'))) {
    await settings.locator('summary').first().click();
  }
}

export async function chooseDateRange(page: Page, preset: '1' | '2' | '3' | '5' | 'custom') {
  const slider = page.getByRole('slider', { name: 'Date range', exact: true });
  await expect(slider).toBeEnabled();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  for (let index = 0; index < ['1', '2', '3', '5', 'custom'].indexOf(preset); index++) {
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue(String(index + 1));
  }
}

/** Change the next-query limit through the visible popover without submitting. */
export async function chooseVideoCount(page: Page, count: number) {
  await chooseModalityLimit(page, 'Videos', count);
}

export async function chooseModalityLimit(page: Page, lane: 'Papers' | 'Videos' | 'Data per catalog' | 'Repos', count: number) {
  await page.getByRole('button', { name: 'Search result limits', exact: true }).click();
  const slider = page.getByRole('slider', { name: lane, exact: true });
  await expect(slider).toBeEnabled();
  await slider.press('Home');
  for (let value = 0; value < count; value++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(count));
  await page.keyboard.press('Escape');
}
