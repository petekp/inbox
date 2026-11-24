import { isClientNew, PANE_PAD_PER_CLIENT_PAD, withCopy } from './client-copy'
import { foldTree, type FoldProps } from './fold-client'
import { noteShown } from './held-clients'
import { linksTree, type LinksProps } from './links-client'
import type { PaneClient } from './pane-context'
import { parentTree, type ParentProps } from './parent-client'
import { rowTree, type RowProps } from './row-client'
import { titleTree, type TitleProps } from './title-client'

type Elements = Extract<PaneClient, { hasClient: true }>['elements']

const AT_REST = { hover: false, pressed: false }

/** A collapsed row's Client, which takes a click on every cell of the row. */
export function rowClient(elements: Elements, key: string, props: RowProps) {
  const isNew = isClientNew(key)
  const { Box, Text } = elements

  return withCopy(
    Box,
    isNew,
    <elements.Client key={key} module="./row-client.tsx" width="100%" props={{ ...props, isOverCopy: isNew }} />,
    () => rowTree(props, { Box, Text }, AT_REST, props.fallbackColumns, PANE_PAD_PER_CLIENT_PAD),
  )
}

/** An open row's title, which collapses the row on a click. */
export function titleClient(elements: Elements, key: string, props: TitleProps) {
  const isNew = isClientNew(key)
  noteShown(key, { kind: 'title', props })
  const { Box, Text } = elements

  return withCopy(
    Box,
    isNew,
    <elements.Client key={key} module="./title-client.tsx" width="100%" props={{ ...props, isOverCopy: isNew }} />,
    () => titleTree(props, { Box, Text }, AT_REST),
  )
}

/** A fold's line, which folds or unfolds on a click. */
export function foldClient(elements: Elements, key: string, props: FoldProps) {
  const isNew = isClientNew(key)
  const { Box, Text } = elements

  return withCopy(
    Box,
    isNew,
    <elements.Client key={key} module="./fold-client.tsx" width="100%" props={{ ...props, isOverCopy: isNew }} />,
    () => foldTree(props, { Box, Text }, false, PANE_PAD_PER_CLIENT_PAD),
  )
}

/** A row's links, each of which posts its press. */
export function linksClient(elements: Elements, key: string, props: LinksProps) {
  const isNew = isClientNew(key)
  noteShown(key, { kind: 'links', props })
  const { Box, Text } = elements

  return withCopy(
    Box,
    isNew,
    <elements.Client key={key} module="./links-client.tsx" width="100%" props={{ ...props, isOverCopy: isNew }} />,
    () => linksTree(props, { Box, Text }, null, props.fallbackColumns),
  )
}

/** A Status parent's name line, which folds the parent's rows or opens them on a click. */
export function parentClient(elements: Elements, key: string, props: ParentProps) {
  const isNew = isClientNew(key)
  const { Box, Text } = elements

  return withCopy(
    Box,
    isNew,
    <elements.Client key={key} module="./parent-client.tsx" width="100%" props={{ ...props, isOverCopy: isNew }} />,
    () => parentTree(props, { Box, Text }, false),
  )
}
